import { type Span } from "@opentelemetry/api";

import { getClientLogger, getClientTracer } from "~/telemetry.js";

import { type BufferConfig, DEFAULT_BUFFER_CONFIG } from "./bufferConfig.js";
import { getSessionContext } from "./playbackSession.js";

export { type BufferConfig, DEFAULT_BUFFER_CONFIG };

const log = getClientLogger("bufferManager");
const tracer = getClientTracer("bufferManager");

export type BufferPauseCallback = () => void;
export type BufferResumeCallback = () => void;

export class BufferManager {
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private objectUrl: string | null = null;
  private videoEl: HTMLVideoElement;
  // Offscreen <video> element used as the MediaSource anchor in background mode
  // (initBackground). Stored on the instance to prevent GC from detaching the
  // MediaSource before buffering is complete. Cleared by promoteToForeground().
  private offscreenVideoEl: HTMLVideoElement | null = null;
  private onPause: BufferPauseCallback;
  private onResume: BufferResumeCallback;
  private appendQueue: Array<{ data: ArrayBuffer; resolve: () => void }> = [];
  private isAppending = false;
  private streamDone = false;
  private config: BufferConfig;
  private streamPaused = false;
  private backpressureSpan: Span | null = null;
  private afterAppendCb: (() => void) | null = null;
  private seekAbort = false;
  private videoDurationS: number;

  // Buffer memory tracking — estimated byte-level accounting.
  // Browser MSE APIs only expose TimeRanges (seconds), not bytes, so
  // bytesInBuffer is an approximation: we add exact segment sizes on append
  // and subtract proportionally (by time fraction) on eviction.
  private totalBytesAppended = 0;
  private bytesInBuffer = 0;
  private evictionCount = 0;
  private segmentsAppended = 0;

  constructor(
    videoEl: HTMLVideoElement,
    onPause: BufferPauseCallback,
    onResume: BufferResumeCallback,
    videoDurationS = 0,
    config: BufferConfig = DEFAULT_BUFFER_CONFIG
  ) {
    this.videoEl = videoEl;
    this.onPause = onPause;
    this.onResume = onResume;
    this.videoDurationS = videoDurationS;
    this.config = config;
  }

  /** Current buffer memory metrics. All byte values are estimates. */
  get bufferStats(): {
    bytesInBuffer: number;
    totalBytesAppended: number;
    bufferedSeconds: number;
    evictionCount: number;
    segmentsAppended: number;
  } {
    const sb = this.sourceBuffer;
    const bufferedSeconds =
      sb && sb.buffered.length > 0
        ? sb.buffered.end(sb.buffered.length - 1) - sb.buffered.start(0)
        : 0;
    return {
      bytesInBuffer: this.bytesInBuffer,
      totalBytesAppended: this.totalBytesAppended,
      bufferedSeconds,
      evictionCount: this.evictionCount,
      segmentsAppended: this.segmentsAppended,
    };
  }

  /** Buffered end in seconds (0 if nothing buffered yet). */
  get bufferedEnd(): number {
    const sb = this.sourceBuffer;
    if (!sb || sb.buffered.length === 0) return 0;
    return sb.buffered.end(sb.buffered.length - 1);
  }

  /** Seconds of media buffered ahead of the given currentTime, or null if the
   *  buffer is empty. Used as a telemetry attribute on playback-stall spans so
   *  we can tell at-a-glance whether a `waiting` event fired with 0s ahead (true
   *  underrun) vs a fraction of a second (decoder hiccup). */
  getBufferedAheadSeconds(currentTime: number): number | null {
    const sb = this.sourceBuffer;
    if (!sb || sb.buffered.length === 0) return null;
    return sb.buffered.end(sb.buffered.length - 1) - currentTime;
  }

  init(mimeType: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ms = new MediaSource();
      this.mediaSource = ms;
      this.objectUrl = URL.createObjectURL(ms);
      this.videoEl.src = this.objectUrl;

      ms.addEventListener(
        "sourceopen",
        () => {
          try {
            this.sourceBuffer = ms.addSourceBuffer(mimeType);
            // segments mode honors each segment's own PTS instead of the UA
            // auto-advancing timestampOffset per append. The chunker emits
            // chunk N's segments with `-output_ts_offset {chunkStart}` so they
            // already carry source-time PTS — appending out of order (e.g.
            // ChunkPipeline's foreground + lookahead slots interleaving) lands
            // each segment at its true buffer-time. In sequence mode the same
            // interleave ballooned the buffer to hundreds of MB.
            this.sourceBuffer.mode = "segments";
            // Pre-set duration to the full video length so the browser allows
            // seeking anywhere in the video immediately, even before that range
            // is buffered. Without this, videoEl.currentTime is clamped to
            // ms.duration (which starts near 0) and seek targets beyond the
            // currently-buffered end are silently truncated.
            if (this.videoDurationS > 0) {
              ms.duration = this.videoDurationS;
            }
            // Drive back-pressure checks as the video plays forward, so a paused
            // stream gets resumed even when no new segments are being appended.
            this.videoEl.addEventListener("timeupdate", this.handleTimeUpdate);
            // Log the actual SourceBuffer mode the UA accepted, not the value we
            // tried to set — Chromium silently keeps "sequence" if it didn't
            // honour the assignment (rare but possible on some codec configs).
            // A trace where this says "sequence" while source has "segments"
            // means a stale client bundle (HMR miss / cached SW / unrefreshed
            // tab) — see trace 963696a2… for the symptom (chunk 2 stacked on
            // chunk 1, playhead skipped to chunk 3).
            log.info(`MSE ready — sourceBuffer added (${mimeType})`, {
              mime_type: mimeType,
              source_buffer_mode: this.sourceBuffer.mode,
            });
            resolve();
          } catch (err) {
            log.error("addSourceBuffer failed", { message: (err as Error).message });
            reject(err);
          }
        },
        { once: true }
      );
    });
  }

  /**
   * Register a callback that fires synchronously after each segment is appended
   * to the SourceBuffer. Pass null to unregister. Used by the startup check in
   * useChunkedPlayback to detect when bufferedEnd crosses the startup threshold
   * without relying solely on requestAnimationFrame (which fires too slowly in
   * headless environments such as Playwright).
   */
  setAfterAppend(cb: (() => void) | null): void {
    this.afterAppendCb = cb;
  }

  async appendSegment(data: ArrayBuffer): Promise<void> {
    return new Promise<void>((resolve) => {
      this.appendQueue.push({ data, resolve });
      if (!this.isAppending) {
        void this.drainQueue();
      }
    });
  }

  private async drainQueue(): Promise<void> {
    this.isAppending = true;
    while (this.appendQueue.length > 0) {
      if (this.seekAbort) break;
      const item = this.appendQueue.shift();
      if (item === undefined) break;
      const { data, resolve } = item;
      const sb = this.sourceBuffer;
      if (!sb) {
        resolve();
        break;
      }
      // Bail immediately if the MediaSource is no longer open — every subsequent
      // appendBuffer call would throw InvalidStateError, producing a cascade of
      // identical errors for every segment still in the queue.
      if (this.mediaSource?.readyState !== "open") {
        log.warn("MediaSource not open — aborting append queue", {
          ready_state: this.mediaSource?.readyState ?? "null",
          queued_segments: this.appendQueue.length + 1,
        });
        resolve();
        for (const remaining of this.appendQueue) remaining.resolve();
        this.appendQueue = [];
        break;
      }
      await this.waitForUpdateEnd();
      if (this.seekAbort) {
        resolve();
        break;
      }
      // Retry loop: on QuotaExceededError, evict progressively more buffer space
      // and try again. Without a retry the segment is silently dropped and every
      // subsequent append also fails because the SourceBuffer stays full.
      //
      // Eviction strategy per attempt:
      //   1 — normal back-buffer eviction (currentTime - config.backBufferKeepS)
      //   2 — aggressive: remove everything behind currentTime (no keep window)
      //   3 — nuclear: remove all buffered content
      let appended = false;
      let fatalError = false;
      for (let attempt = 0; attempt <= 3 && !appended && !this.seekAbort; attempt++) {
        if (attempt > 0) {
          log.warn(`QuotaExceededError — evicting buffer and retrying (attempt ${attempt}/3)`, {
            attempt,
          });
          if (attempt === 1) {
            await this.evictBackBuffer();
          } else if (attempt === 2) {
            // Remove everything strictly behind currentTime.
            if (sb.buffered.length > 0) {
              const bufStart = sb.buffered.start(0);
              const evictTo = this.videoEl.currentTime;
              if (bufStart < evictTo) {
                await this.waitForUpdateEnd();
                if (!this.seekAbort) {
                  sb.remove(bufStart, evictTo);
                  await this.waitForUpdateEnd();
                }
              }
            }
          } else {
            // Nuclear: remove everything — drastic but better than infinite failure.
            await this.waitForUpdateEnd();
            if (!this.seekAbort) {
              sb.remove(0, Infinity);
              await this.waitForUpdateEnd();
            }
          }
          if (this.seekAbort) break;
        }
        try {
          sb.appendBuffer(data);
          await this.waitForUpdateEnd();
          if (this.seekAbort) break;
          appended = true;
          this.totalBytesAppended += data.byteLength;
          this.bytesInBuffer += data.byteLength;
          this.segmentsAppended++;
        } catch (err) {
          if ((err as DOMException).name === "QuotaExceededError" && attempt < 3) {
            continue; // retry after eviction
          }
          // Capture state-at-error so the next failure trace tells us which
          // InvalidStateError variant fired (closed MediaSource, removed
          // SourceBuffer, in-flight `updating` race, …) without a code
          // change. See trace ac249ef0… — 90 identical errors over 36 s with
          // only `message` made the root cause indistinguishable.
          const domErr = err as DOMException;
          // `source_buffer_in_ms_list`: distinguishes "browser detached our
          // SourceBuffer under memory pressure" (false) from any other
          // InvalidStateError cause (true). Trace 65ef5d6c… narrowed the
          // cause to "SB removed from sourceBuffers while we still hold the
          // ref"; this field nails the final attribution. Cumulative bytes
          // helps confirm Chromium's MSE-budget hypothesis (typically
          // ~150–300 MB before forced eviction; we hit InvalidStateError at
          // 2.1 GB cumulative).
          const sbInMsList =
            this.mediaSource !== null && Array.from(this.mediaSource.sourceBuffers).includes(sb);
          log.error("appendBuffer error", {
            message: domErr.message,
            error_name: domErr.name,
            error_code: domErr.code,
            media_source_ready_state: this.mediaSource?.readyState ?? "null",
            source_buffer_updating: sb.updating,
            source_buffer_present: this.sourceBuffer !== null,
            source_buffer_in_ms_list: sbInMsList,
            data_bytes: data.byteLength,
            segments_appended: this.segmentsAppended,
            total_bytes_appended: this.totalBytesAppended,
            attempt,
          });
          fatalError = true;
          break;
        }
      }
      resolve();
      // A non-recoverable append error (e.g. InvalidStateError from a closed
      // MediaSource) means every remaining segment will also fail. Drain the
      // queue immediately so callers don't block, then stop.
      if (fatalError || this.seekAbort) {
        for (const remaining of this.appendQueue) remaining.resolve();
        this.appendQueue = [];
        break;
      }
      await this.evictBackBuffer();
      this.checkForwardBuffer();
      this.afterAppendCb?.();
      if (this.segmentsAppended % this.config.healthLogIntervalSegments === 0) {
        const stats = this.bufferStats;
        // Snapshot the actual SourceBuffer ranges so the next trace shows
        // empirically *where* segments are landing — not just bufferedSeconds
        // (which only reads the LAST range and hides chunk-stacking bugs).
        // Trace b37fc612… showed end(last) plateauing at ~300 while chunk 2
        // streamed in cleanly with TFDT 300 — needed range visibility to
        // tell whether chunk 2 created a separate range, overlapped chunk 1,
        // or landed somewhere else entirely.
        const ranges: Array<[number, number]> = [];
        for (let i = 0; i < sb.buffered.length; i++) {
          ranges.push([
            parseFloat(sb.buffered.start(i).toFixed(2)),
            parseFloat(sb.buffered.end(i).toFixed(2)),
          ]);
        }
        log.info(
          `Buffer health — ${stats.segmentsAppended} segments, ${(stats.bytesInBuffer / 1_048_576).toFixed(1)} MB in buffer (${stats.bufferedSeconds.toFixed(1)}s), ${(stats.totalBytesAppended / 1_048_576).toFixed(1)} MB total appended`,
          {
            segments_appended: stats.segmentsAppended,
            buffer_bytes: stats.bytesInBuffer,
            buffer_mb: parseFloat((stats.bytesInBuffer / 1_048_576).toFixed(2)),
            buffered_s: parseFloat(stats.bufferedSeconds.toFixed(1)),
            total_bytes_appended: stats.totalBytesAppended,
            eviction_count: stats.evictionCount,
            buffered_ranges_json: JSON.stringify(ranges),
            buffered_range_count: ranges.length,
            current_time_s: parseFloat(this.videoEl.currentTime.toFixed(2)),
          }
        );
      }
    }
    this.isAppending = false;

    if (this.streamDone && !this.seekAbort) {
      this.endStream();
    }
  }

  private waitForUpdateEnd(): Promise<void> {
    const sb = this.sourceBuffer;
    if (!sb || !sb.updating) return Promise.resolve();
    return new Promise((resolve) => {
      sb.addEventListener("updateend", () => resolve(), { once: true });
    });
  }

  /**
   * Returns the video element to use as the playback position reference.
   * In background mode (offscreenVideoEl is set), currentTime is always 0
   * so eviction naturally skips (nothing is "behind" position 0) and
   * back-pressure is based on total buffered duration rather than ahead-of-
   * playhead duration — which is the correct behaviour for a silent buffer.
   */
  private get timeRef(): HTMLVideoElement {
    return this.offscreenVideoEl ?? this.videoEl;
  }

  /**
   * Call after the background buffer has been promoted to the foreground video
   * element. Clears the offscreen element reference so that eviction and
   * back-pressure checks switch to using the real video's currentTime.
   */
  promoteToForeground(): void {
    if (this.offscreenVideoEl) {
      this.offscreenVideoEl.src = "";
      this.offscreenVideoEl = null;
    }
  }

  private async evictBackBuffer(): Promise<void> {
    const sb = this.sourceBuffer;
    if (!sb || sb.buffered.length === 0) return;

    const evictEnd = this.timeRef.currentTime - this.config.backBufferKeepS;
    const bufStart = sb.buffered.start(0);

    if (bufStart < evictEnd) {
      // Proportional byte estimate: evicted fraction of total buffered duration.
      const totalBufferedS = sb.buffered.end(sb.buffered.length - 1) - sb.buffered.start(0);
      const evictDurationS = evictEnd - bufStart;
      if (totalBufferedS > 0) {
        const fraction = evictDurationS / totalBufferedS;
        const estimatedEvictedBytes = Math.round(fraction * this.bytesInBuffer);
        this.bytesInBuffer = Math.max(0, this.bytesInBuffer - estimatedEvictedBytes);
        this.evictionCount++;
      }
      await this.waitForUpdateEnd();
      sb.remove(bufStart, evictEnd);
      await this.waitForUpdateEnd();
    }
  }

  private handleTimeUpdate = (): void => {
    this.checkForwardBuffer();
  };

  private checkForwardBuffer(): void {
    const sb = this.sourceBuffer;
    if (!sb || sb.buffered.length === 0) return;

    const bufferedAhead = sb.buffered.end(sb.buffered.length - 1) - this.timeRef.currentTime;

    if (bufferedAhead > this.config.forwardTargetS && !this.streamPaused) {
      this.streamPaused = true;
      const bufMb = (this.bytesInBuffer / 1_048_576).toFixed(1);
      log.info(
        `Stream paused (backpressure) — ${bufferedAhead.toFixed(1)}s buffered ahead (target: ${this.config.forwardTargetS}s), ${bufMb} MB in buffer`,
        {
          buffered_ahead_s: parseFloat(bufferedAhead.toFixed(1)),
          target_s: this.config.forwardTargetS,
          buffer_bytes: this.bytesInBuffer,
          buffer_mb: parseFloat(bufMb),
        }
      );
      this.backpressureSpan = tracer.startSpan(
        "buffer.backpressure",
        {
          attributes: {
            "buffer.buffered_ahead_s_at_pause": parseFloat(bufferedAhead.toFixed(1)),
            "buffer.target_s": this.config.forwardTargetS,
            "buffer.resume_threshold_s": this.config.forwardResumeS,
            "buffer.bytes_at_pause": this.bytesInBuffer,
          },
        },
        getSessionContext()
      );
      this.onPause();
    } else if (bufferedAhead < this.config.forwardResumeS && this.streamPaused) {
      this.streamPaused = false;
      const bufMb = (this.bytesInBuffer / 1_048_576).toFixed(1);
      log.info(
        `Stream resumed (backpressure) — ${bufferedAhead.toFixed(1)}s buffered ahead (resume threshold: ${this.config.forwardResumeS}s), ${bufMb} MB in buffer`,
        {
          buffered_ahead_s: parseFloat(bufferedAhead.toFixed(1)),
          resume_threshold_s: this.config.forwardResumeS,
          buffer_bytes: this.bytesInBuffer,
          buffer_mb: parseFloat(bufMb),
        }
      );
      if (this.backpressureSpan) {
        this.backpressureSpan.setAttribute(
          "buffer.buffered_ahead_s_at_resume",
          parseFloat(bufferedAhead.toFixed(1))
        );
        this.backpressureSpan.end();
        this.backpressureSpan = null;
      }
      this.onResume();
    }
  }

  /** Closes the backpressure span early (if open) with a named end event.
   *  Used by seek/teardown, which can interrupt a backpressure pause before
   *  the stream would have naturally resumed. Idempotent. */
  private endBackpressureSpan(reason: string): void {
    if (!this.backpressureSpan) return;
    this.backpressureSpan.addEvent(reason);
    this.backpressureSpan.end();
    this.backpressureSpan = null;
  }

  /**
   * Initialises a background MediaSource (not attached to videoEl) so segments
   * can be buffered before the switch. Returns the ObjectURL to assign to
   * videoEl.src when the buffer is ready for swap.
   */
  initBackground(mimeType: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const ms = new MediaSource();
      this.mediaSource = ms;
      // Attach to an offscreen element — sourceopen only fires when the
      // MediaSource is connected to a media element. Store it on the instance
      // so it can't be garbage-collected (which would detach the MediaSource
      // and silently break buffering).
      const tmp = document.createElement("video");
      this.offscreenVideoEl = tmp;
      this.objectUrl = URL.createObjectURL(ms);
      tmp.src = this.objectUrl;

      ms.addEventListener(
        "sourceopen",
        () => {
          try {
            this.sourceBuffer = ms.addSourceBuffer(mimeType);
            this.sourceBuffer.mode = "segments";
            if (this.videoDurationS > 0) {
              ms.duration = this.videoDurationS;
            }
            log.info(`Background MSE ready — sourceBuffer added (${mimeType})`, {
              mime_type: mimeType,
              source_buffer_mode: this.sourceBuffer.mode,
            });
            resolve(this.objectUrl as string);
          } catch (err) {
            log.error("Background addSourceBuffer failed", { message: (err as Error).message });
            reject(err);
          }
        },
        { once: true }
      );
    });
  }

  markStreamDone(): void {
    this.streamDone = true;
    if (!this.isAppending) {
      this.endStream();
    }
  }

  private endStream(): void {
    if (this.mediaSource?.readyState === "open") {
      try {
        this.mediaSource.endOfStream();
        log.info("endOfStream");
      } catch {
        // May already be closed
      }
    }
  }

  async seek(timeSeconds: number): Promise<void> {
    const sb = this.sourceBuffer;
    if (!sb) return;
    // Signal drainQueue to stop at its next checkpoint and drain the queue
    // immediately so drainQueue exits its while loop rather than picking up
    // more items while we wait for the SourceBuffer to finish its current op.
    this.seekAbort = true;
    for (const item of this.appendQueue) item.resolve();
    this.appendQueue = [];
    this.afterAppendCb = null;
    // Wait for any in-progress appendBuffer/remove to complete before calling
    // sb.remove() — calling it while updating=true throws InvalidStateError.
    await this.waitForUpdateEnd();
    this.seekAbort = false;
    this.isAppending = false;
    this.streamDone = false;
    this.streamPaused = false;
    this.endBackpressureSpan("backpressure_ended_by_seek");
    this.bytesInBuffer = 0;
    sb.remove(0, Infinity);
    await this.waitForUpdateEnd();
    // In segments mode each segment carries source-time PTS (set by the
    // chunker via -output_ts_offset), so no timestampOffset gymnastics are
    // needed after flush — incoming segments land where their PTS says.
    this.videoEl.currentTime = timeSeconds;
    log.info(`Buffer flushed — seek to ${timeSeconds.toFixed(2)}s`, {
      seek_target_s: parseFloat(timeSeconds.toFixed(2)),
    });
  }

  /**
   * Tears down the MediaSource and revokes the ObjectURL.
   * Pass `clearVideoEl = true` (default) to also clear videoEl.src — omit this
   * when tearing down a foreground buffer whose src has already been replaced by
   * the background buffer swap.
   */
  teardown(clearVideoEl = true): void {
    this.videoEl.removeEventListener("timeupdate", this.handleTimeUpdate);
    if (clearVideoEl) {
      this.videoEl.src = "";
    }
    // Clear the offscreen element before revoking the URL to avoid a brief
    // period where the element holds a reference to a revoked blob URL.
    if (this.offscreenVideoEl) {
      this.offscreenVideoEl.src = "";
      this.offscreenVideoEl = null;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.mediaSource = null;
    this.sourceBuffer = null;
    // Resolve any pending segment promises so callers don't hang after teardown.
    for (const item of this.appendQueue) item.resolve();
    this.appendQueue = [];
    this.afterAppendCb = null;
    this.isAppending = false;
    this.streamDone = false;
    this.streamPaused = false;
    this.seekAbort = false;
    const stats = this.bufferStats;
    log.info(
      `Teardown — ${stats.segmentsAppended} segments, ${(stats.totalBytesAppended / 1_048_576).toFixed(1)} MB total, ${stats.evictionCount} evictions — ObjectURL revoked`,
      {
        segments_appended: stats.segmentsAppended,
        total_bytes_appended: stats.totalBytesAppended,
        eviction_count: stats.evictionCount,
      }
    );
    this.totalBytesAppended = 0;
    this.bytesInBuffer = 0;
    this.evictionCount = 0;
    this.segmentsAppended = 0;
    this.endBackpressureSpan("backpressure_ended_by_teardown");
  }
}
