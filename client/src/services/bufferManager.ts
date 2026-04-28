import { type Span } from "@opentelemetry/api";

import { type BufferConfig, clientConfig } from "~/config/appConfig.js";
import { getClientLogger, getClientTracer } from "~/telemetry.js";

import { getSessionContext } from "./playbackSession.js";

export { type BufferConfig };
/** Re-exported alias for backward compatibility with consumers that previously
 *  imported `DEFAULT_BUFFER_CONFIG`. Now points at `clientConfig.buffer`. */
export const DEFAULT_BUFFER_CONFIG: BufferConfig = clientConfig.buffer;

const log = getClientLogger("bufferManager");
const tracer = getClientTracer("bufferManager");

export type BufferPauseCallback = () => void;
export type BufferResumeCallback = () => void;
/** Fired when an `appendBuffer` rejects with `InvalidStateError` AND the
 * SourceBuffer is no longer present in `mediaSource.sourceBuffers` — the
 * Chrome-detached-SB-under-MSE-budget pattern documented in the
 * `appendBuffer error` branch. PlaybackController uses this signal to tear
 * down + recreate the MediaSource and resume from `currentTime` rather than
 * surfacing a fatal error to the user. Optional: callers that don't supply
 * one fall back to the legacy fatal-error behaviour. */
export type BufferMseDetachedCallback = () => void;

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
  private onMseDetached: BufferMseDetachedCallback | null = null;
  private appendQueue: Array<{ data: ArrayBuffer; resolve: () => void }> = [];
  private isAppending = false;
  private streamDone = false;
  private config: BufferConfig;
  private streamPaused = false;
  /** Resolved when streamPaused flips false. Recreated on every pause so each
   * `waitIfPaused` caller gets a fresh promise. Null when not paused. */
  private resumeSignal: { promise: Promise<void>; resolve: () => void } | null = null;
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

  // Mirrors `sourceBuffer.timestampOffset` so callers can skip a no-op assign.
  // ChunkPipeline.processSegment writes this on every chunk's init append to
  // shift the chunk's relative tfdt (0+) into source-time playback position
  // (chunkStart + tfdt). See setTimestampOffset for the full rationale.
  private timestampOffsetS = 0;

  constructor(
    videoEl: HTMLVideoElement,
    onPause: BufferPauseCallback,
    onResume: BufferResumeCallback,
    videoDurationS = 0,
    config: BufferConfig = DEFAULT_BUFFER_CONFIG,
    onMseDetached: BufferMseDetachedCallback | null = null
  ) {
    this.videoEl = videoEl;
    this.onPause = onPause;
    this.onResume = onResume;
    this.videoDurationS = videoDurationS;
    this.config = config;
    this.onMseDetached = onMseDetached;
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
            // segments mode places each segment at `timestampOffset + tfdt`,
            // giving us explicit control of the per-chunk offset. The chunker
            // emits each chunk's segments with relative tfdt (0, 2, 4, …
            // within the chunk window) — the `-output_ts_offset` flag on the
            // server records the chunk-start as an empty `elst` edit but
            // Chromium MSE ignores edit lists, so the client must shift the
            // segments itself. ChunkPipeline calls
            // `BufferManager.setTimestampOffset(slot.opts.chunkStartS)` on
            // every chunk's init append, so a segment with tfdt=160 in chunk
            // [4200, 4500) lands at playback time 4360. Sequence mode would
            // auto-advance the offset per append and fight that explicit
            // assignment — segments interleave from foreground+lookahead
            // would also balloon the buffer (observed historically).
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

      // Diagnostic: Chromium can flip MS to "ended" without our endStream()
      // being called (observed mid-playback in trace 8c10bcac…). The leading
      // hypothesis (per architect, 2026-04-27) is an internal end-of-presentation
      // probe that fires when the SourceBuffer is empty at currentTime and the
      // decoder can't make progress within a timeout window — common during
      // SW-fallback encoding's slow first-segment path. The `stream_done`
      // attribute distinguishes our own endStream() call (true) from a Chromium-
      // internal transition (false). Listen once — the MS lifecycle ends here.
      ms.addEventListener(
        "sourceended",
        () => {
          const sb = this.sourceBuffer;
          const sbInList =
            this.mediaSource !== null &&
            sb !== null &&
            Array.from(this.mediaSource.sourceBuffers).includes(sb);
          const ranges: Array<[number, number]> = [];
          if (sb) {
            for (let i = 0; i < sb.buffered.length; i++) {
              ranges.push([
                parseFloat(sb.buffered.start(i).toFixed(2)),
                parseFloat(sb.buffered.end(i).toFixed(2)),
              ]);
            }
          }
          log.warn("MediaSource sourceended fired", {
            ready_state: ms.readyState,
            stream_done: this.streamDone,
            video_error_code: this.videoEl.error?.code ?? -1,
            video_error_message: this.videoEl.error?.message ?? "",
            sb_updating: sb?.updating ?? false,
            sb_in_ms_list: sbInList,
            current_time_s: parseFloat(this.videoEl.currentTime.toFixed(2)),
            ms_duration_s: parseFloat(ms.duration.toFixed(2)),
            buffered_ranges_json: JSON.stringify(ranges),
            buffered_range_count: ranges.length,
            is_appending: this.isAppending,
            append_queue_depth: this.appendQueue.length,
            timestamp_offset_s: this.timestampOffsetS,
          });
          // Defense-in-depth: when the seal wasn't ours (streamDone=false),
          // Chromium has internally called endOfStream(decode_error) — likely
          // from a chunk-demuxer sample-prepare failure. Trigger the existing
          // MSE-recreate recovery so the player rebuilds the MediaSource and
          // resumes from currentTime instead of leaving the user with a
          // permanently sealed buffer.
          if (!this.streamDone && this.onMseDetached) {
            this.onMseDetached();
          }
        },
        { once: true }
      );

      // Distinguishes Chromium's `open → closed` (videoEl.src reassigned, MS
      // GC'd) from `open → ended` (the bug we're chasing). Both end the MS
      // lifecycle but only one is the symptom we care about.
      ms.addEventListener(
        "sourceclose",
        () => {
          log.info("MediaSource sourceclose fired", {
            ready_state: ms.readyState,
            stream_done: this.streamDone,
            current_time_s: parseFloat(this.videoEl.currentTime.toFixed(2)),
          });
        },
        { once: true }
      );

      // The async decoder-error path: a decode failure that arrives AFTER
      // appendBuffer resolved cleanly surfaces here, not via appendBuffer
      // throw. Pairs with the sourceended diagnostic to attribute MS-ended
      // transitions to the "decoder gave up" branch vs the "presentation
      // probe timeout" branch.
      this.videoEl.addEventListener(
        "error",
        () => {
          log.error("video element error event", {
            video_error_code: this.videoEl.error?.code ?? -1,
            video_error_message: this.videoEl.error?.message ?? "",
            ready_state: this.mediaSource?.readyState ?? "null",
            current_time_s: parseFloat(this.videoEl.currentTime.toFixed(2)),
          });
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

  /**
   * Shifts the SourceBuffer's coordinate system so subsequent media segments
   * land at `tfdt + offsetS`. Called by `ChunkPipeline.processSegment` on
   * every chunk's init append with `slot.opts.chunkStartS`.
   *
   * Chunker emits relative tfdt (0+) per chunk; this offset bridges the gap
   * to absolute source time — see the `init()` mode-comment for the full
   * rationale. Idempotent: a no-op assign is skipped, so chunks at the same
   * offset (re-init within a chunk) don't pay the wait-for-updateend cost.
   *
   * Must be awaited before the next `appendSegment` so `sb.timestampOffset`
   * is settled before MSE consumes the next byte. Per spec the assignment
   * throws InvalidStateError while `sb.updating` is true; the wait below
   * mirrors `appendBuffer`'s own guard.
   */
  async setTimestampOffset(offsetS: number): Promise<void> {
    if (offsetS === this.timestampOffsetS) return;
    const sb = this.sourceBuffer;
    if (!sb) {
      this.timestampOffsetS = offsetS;
      return;
    }
    await this.waitForUpdateEnd();
    sb.timestampOffset = offsetS;
    this.timestampOffsetS = offsetS;
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
          // Capture SB state at the moment quota was hit. Distinguishes
          // "quota with N MB legitimately buffered" from "quota with empty
          // buffered ranges" — the latter would point at Chrome's hidden
          // per-SB cap rather than our own back-buffer leak.
          const quotaBufLen = sb.buffered.length;
          // Sentinel: -1 means "no buffered range" (paired with buffered_range_count=0).
          // Keeps the attribute schema flat (number) — logger rejects nulls.
          const quotaBufStart = quotaBufLen > 0 ? parseFloat(sb.buffered.start(0).toFixed(2)) : -1;
          const quotaBufEnd =
            quotaBufLen > 0 ? parseFloat(sb.buffered.end(quotaBufLen - 1).toFixed(2)) : -1;
          log.warn(
            `QuotaExceededError — evicting buffer and retrying (attempt ${attempt}/3) — buffered=${quotaBufLen} range(s), bytesInBuffer=${(this.bytesInBuffer / 1_048_576).toFixed(1)}MB, currentTime=${this.videoEl.currentTime.toFixed(2)}s`,
            {
              attempt,
              buffered_range_count: quotaBufLen,
              buf_start_s: quotaBufStart,
              buf_end_s: quotaBufEnd,
              buffer_bytes: this.bytesInBuffer,
              buffer_mb: parseFloat((this.bytesInBuffer / 1_048_576).toFixed(2)),
              current_time_s: parseFloat(this.videoEl.currentTime.toFixed(2)),
              data_bytes: data.byteLength,
            }
          );
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
          // SB-detached-by-Chrome pattern (trace 65ef5d6c…): InvalidStateError +
          // SB no longer in mediaSource.sourceBuffers. Fire the recovery hook
          // before draining so PlaybackController can rebuild the MediaSource
          // and resume from currentTime instead of surfacing a hard failure.
          if (domErr.name === "InvalidStateError" && !sbInMsList && this.onMseDetached) {
            log.warn("SourceBuffer detached from MediaSource — invoking recovery hook", {
              segments_appended: this.segmentsAppended,
              total_bytes_appended: this.totalBytesAppended,
            });
            this.onMseDetached();
          }
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
      // Diagnostic: dump full SB range state on every eviction so the
      // post-seek stuck-buffer trace can pinpoint *why* the eviction math
      // matched (legitimate back-buffer growth vs racing currentTime vs
      // segments landing behind the playhead). Safe in steady state — only
      // fires when there's actually back-buffer to evict.
      const ranges: Array<[number, number]> = [];
      for (let i = 0; i < sb.buffered.length; i++) {
        ranges.push([
          parseFloat(sb.buffered.start(i).toFixed(2)),
          parseFloat(sb.buffered.end(i).toFixed(2)),
        ]);
      }
      const bufferedEnd = sb.buffered.end(sb.buffered.length - 1);
      log.warn(
        `Eviction firing — bufStart=${bufStart.toFixed(2)}s, bufferedEnd=${bufferedEnd.toFixed(2)}s, currentTime=${this.timeRef.currentTime.toFixed(2)}s, evictEnd=${evictEnd.toFixed(2)}s, ${sb.buffered.length} range(s)`,
        {
          buf_start_s: parseFloat(bufStart.toFixed(2)),
          buffered_end_s: parseFloat(bufferedEnd.toFixed(2)),
          current_time_s: parseFloat(this.timeRef.currentTime.toFixed(2)),
          evict_end_s: parseFloat(evictEnd.toFixed(2)),
          buffered_range_count: sb.buffered.length,
          buffered_ranges_json: JSON.stringify(ranges),
          back_buffer_keep_s: this.config.backBufferKeepS,
        }
      );
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

  /**
   * Public hook to drive `checkForwardBuffer` from outside `timeupdate`.
   * Used by the user-pause path: while the video element is paused, the
   * browser stops firing `timeupdate`, so backpressure would never engage —
   * the network fetch keeps appending until MSE detaches the SourceBuffer.
   * The controller's pause poller calls this on a timer to drive the same
   * forward-buffer check the playing-time path does.
   */
  tickBackpressure(): void {
    this.checkForwardBuffer();
  }

  /**
   * Returns a promise that resolves the next time backpressure releases, or
   * resolves immediately if no backpressure is currently engaged. Used by
   * `ChunkPipeline.drainAndDispatch` to throttle the lookahead-queue drain
   * the same way the live `streamingService` reader loop does — without this,
   * a queued lookahead floods MSE at chunk handover, which is the
   * trace `e699c0ae…` failure mode (1.3 GB cumulative in 2 s + spinner stall).
   */
  waitIfPaused(): Promise<void> {
    if (!this.streamPaused || !this.resumeSignal) return Promise.resolve();
    return this.resumeSignal.promise;
  }

  private checkForwardBuffer(): void {
    const sb = this.sourceBuffer;
    if (!sb || sb.buffered.length === 0) return;

    const bufferedAhead = sb.buffered.end(sb.buffered.length - 1) - this.timeRef.currentTime;

    if (bufferedAhead > this.config.forwardTargetS && !this.streamPaused) {
      this.streamPaused = true;
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      this.resumeSignal = { promise, resolve };
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
      this.resumeSignal?.resolve();
      this.resumeSignal = null;
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
    this.resumeSignal?.resolve();
    this.resumeSignal = null;
    this.endBackpressureSpan("backpressure_ended_by_seek");
    this.bytesInBuffer = 0;
    sb.remove(0, Infinity);
    await this.waitForUpdateEnd();
    // No explicit timestampOffset reset here — the next chunk's init append
    // (via ChunkPipeline.processSegment → BufferManager.setTimestampOffset)
    // re-anchors the offset to the new chunk's chunkStartS before its first
    // media segment lands. Resetting to 0 here would just churn for no win.
    this.videoEl.currentTime = timeSeconds;
    // Anchor for the MS-ended diagnostic: time-delta between this log and
    // a subsequent `MediaSource sourceended fired` log measures the Chromium
    // internal end-of-presentation probe window. Empty buffer at this point
    // means the decoder has nothing to make progress on while it waits for
    // segment 0 of the new chunk.
    log.info(`Buffer flushed — seek to ${timeSeconds.toFixed(2)}s`, {
      seek_target_s: parseFloat(timeSeconds.toFixed(2)),
      ms_ready_state: this.mediaSource?.readyState ?? "null",
      buffered_range_count: sb.buffered.length,
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
    this.resumeSignal?.resolve();
    this.resumeSignal = null;
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
