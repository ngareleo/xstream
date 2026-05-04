/**
 * Foreground + lookahead streaming slots feeding one BufferManager.
 * Opens lookahead fetches at prefetch time to satisfy the server's
 * orphan_no_connection safety timer without weakening the 30 s threshold.
 */
import { type Span, SpanStatusCode, trace, type Tracer } from "@opentelemetry/api";

import { clientConfig } from "~/config/appConfig.js";
import type { ClientLog } from "~/telemetry.js";
import type { Resolution } from "~/types.js";

import type { BufferManager } from "./bufferManager.js";
import { getSessionContext } from "./playbackSession.js";
import { StreamingService } from "./streamingService.js";

/** Outcome of a foreground stream completion, passed to the caller's onStreamEnded. */
export type StreamOutcome =
  /** Real content streamed; caller should chain to the next chunk. */
  | "completed"
  /** ffmpeg produced only a placeholder (<clientConfig.playback.minRealChunkBytes); pipeline already
   *  called buffer.markStreamDone(); caller should not chain another chunk. */
  | "no_real_content";

export interface ChunkOpts {
  jobId: string;
  chunkStartS: number;
  /** End of the requested transcode window (seconds, exclusive). Stored on
   *  the slot so a lookahead's bounds can be retrieved on promotion without
   *  the controller having to track them in parallel — important under the
   *  ramp, where the duration is consumed once at request time and isn't
   *  re-derivable from a fixed steady-state. */
  chunkEndS: number;
  /** True only for the very first chunk of a session (or a fresh background buffer
   *  during resolution switch). Continuation chunks must NOT re-append the init
   *  segment — would clobber the SourceBuffer's existing init and stall the decoder. */
  isFirstChunk: boolean;
  resolution: Resolution;
  /** Called when the stream ends naturally. The caller decides whether to chain
   *  to the next chunk or finalise the session. */
  onStreamEnded: (outcome: StreamOutcome) => void;
  /** Called on a stream-level error (network, MSE append, etc.). */
  onError: (err: Error) => void;
  /** Fired only when isFirstChunk && isInit — used by PlaybackController to arm
   *  its startup-buffer check. Optional because lookahead/continuation chunks
   *  don't need it. */
  onFirstChunkInit?: () => void;
  /** Fired when the first media segment for this slot is seen (after the init
   *  segment, on the first non-init append). Used by PlaybackTimeline to
   *  measure prefetch-to-first-byte latency. The wall-clock instant is
   *  captured at arrival, not after the append resolves. */
  onFirstMediaSegmentArrived?: (atMs: DOMHighResTimeStamp) => void;
}

interface QueuedSegment {
  data: ArrayBuffer;
  isInit: boolean;
}

interface Slot {
  jobId: string;
  chunkStartS: number;
  chunkEndS: number;
  isFirstChunk: boolean;
  svc: StreamingService;
  span: Span;
  chunkCtx: ReturnType<typeof trace.setSpan>;
  opts: ChunkOpts;
  totalMediaBytes: number;
  segmentCount: number;
  ended: boolean;
  firstMediaSegmentSeen: boolean;
  /** True while the slot is the lookahead. Cleared on promotion. While true,
   *  segments are queued in `queuedSegments` rather than appended directly,
   *  and natural stream completion is captured in `pendingOutcome` instead
   *  of dispatched. The reason: each chunk's init segment carries its own
   *  `elst` (edit list), and appending the lookahead's init while the
   *  foreground is still streaming would re-parent the foreground's
   *  in-flight segments against the wrong edit list — they'd land in the
   *  SourceBuffer but Chrome would silently fragment them (decode only the
   *  keyframes). See trace a96bded1… for the failure shape. */
  isLookahead: boolean;
  /** Lookahead-mode buffer. Network segments accumulate here; on promotion
   *  the drain runs in arrival order (init first, then media), preserving
   *  the chunk's MSE coded-frame-group boundaries. */
  queuedSegments: QueuedSegment[];
  /** Set by `cancel(reason)`. Distinguishes hard teardown ("don't drain")
   *  from natural span end ("drain has completed and dispatch is fine"). */
  cancelled: boolean;
  /** True when `svc` completed naturally while the slot was still a
   *  lookahead. The actual outcome ("completed" vs "no_real_content") can't
   *  be decided yet because `totalMediaBytes` is only incremented during
   *  drain (the queueing path doesn't process bytes); decision is deferred
   *  to drainAndDispatch which reads the post-drain counter. */
  pendingCompletion: boolean;
  endSpan: () => void;
  cancel: (reason: string) => void;
}

export class ChunkPipeline {
  private foreground: Slot | null = null;
  private lookahead: Slot | null = null;

  constructor(
    private readonly buffer: BufferManager,
    private readonly tracer: Tracer,
    private readonly log: ClientLog,
    private readonly videoEl: HTMLVideoElement
  ) {}

  /** Opens the foreground stream. Replaces any existing foreground. */
  startForeground(opts: ChunkOpts): void {
    this.foreground?.cancel("foreground_replaced");
    this.foreground = this.openSlot(opts, /* isLookahead */ false);
  }

  /** Opens the lookahead stream at prefetch time. */
  openLookahead(opts: ChunkOpts): void {
    this.lookahead?.cancel("lookahead_replaced");
    this.lookahead = this.openSlot(opts, /* isLookahead */ true);
  }

  /** True if a lookahead slot is currently open. */
  hasLookahead(): boolean {
    return this.lookahead !== null;
  }

  /** Returns the raw job IDs of every active slot (foreground + lookahead). */
  currentJobIds(): string[] {
    const ids: string[] = [];
    if (this.foreground) ids.push(this.foreground.jobId);
    if (this.lookahead) ids.push(this.lookahead.jobId);
    return ids;
  }

  /** Promotes the lookahead slot to foreground. Returns bounds and drain promise. */
  promoteLookahead(): {
    jobId: string;
    chunkStartS: number;
    chunkEndS: number;
    drain: Promise<void>;
  } {
    if (!this.lookahead) {
      throw new Error("ChunkPipeline.promoteLookahead: no lookahead to promote");
    }
    const slot = this.lookahead;
    this.foreground = slot;
    this.lookahead = null;
    slot.isLookahead = false;
    // Drain the queued init+segments and, only once the SourceBuffer reflects
    // them, dispatch any deferred outcome. Chaining to the next chunk before
    // the drain finishes would race the buffer-state check that
    // PlaybackController.handleChunkEnded does.
    const drain = this.drainAndDispatch(slot);
    return {
      jobId: slot.jobId,
      chunkStartS: slot.chunkStartS,
      chunkEndS: slot.chunkEndS,
      drain,
    };
  }

  /** Drains a slot's queued lookahead segments. Respects backpressure via
   *  buffer.waitIfPaused(). See trace e699c0ae… for chunk-handover bloat rationale. */
  private async drainAndDispatch(slot: Slot): Promise<void> {
    const queue = slot.queuedSegments;
    slot.queuedSegments = [];
    for (const seg of queue) {
      if (slot.cancelled) return;
      await this.buffer.waitIfPaused();
      if (slot.cancelled) return;
      await this.processSegment(slot, seg.data, seg.isInit);
    }
    if (slot.pendingCompletion) {
      slot.pendingCompletion = false;
      const hasRealContent = slot.totalMediaBytes >= clientConfig.playback.minRealChunkBytes;
      if (!hasRealContent) {
        slot.span.addEvent("chunk_no_real_content");
      }
      this.dispatchOutcome(slot, hasRealContent ? "completed" : "no_real_content");
    }
  }

  /** Cancels both slots. */
  cancel(reason: string): void {
    this.foreground?.cancel(reason);
    this.lookahead?.cancel(reason);
    this.foreground = null;
    this.lookahead = null;
  }

  /** Cancels only the lookahead. */
  cancelLookahead(reason: string): void {
    this.lookahead?.cancel(reason);
    this.lookahead = null;
  }

  /** Pause both slots' readers. Must pause together to bound the append queue. */
  pauseAll(): void {
    this.foreground?.svc.pause();
    this.lookahead?.svc.pause();
  }

  /** Resume both slots' readers. */
  resumeAll(): void {
    this.foreground?.svc.resume();
    this.lookahead?.svc.resume();
  }

  /** Pause only the lookahead's reader to prevent segment accumulation during user pause. */
  pauseLookahead(): void {
    this.lookahead?.svc.pause();
  }

  /** Resume only the lookahead's reader. */
  resumeLookahead(): void {
    this.lookahead?.svc.resume();
  }

  /** Acts on a stream outcome. Owns the markStreamDone call for no_real_content. */
  private dispatchOutcome(slot: Slot, outcome: StreamOutcome): void {
    if (outcome === "no_real_content") {
      this.log.info("Chunk had no real content — marking stream done", {
        job_id: slot.jobId,
        total_media_bytes: slot.totalMediaBytes,
      });
      this.buffer.markStreamDone();
    }
    slot.opts.onStreamEnded(outcome);
  }

  private openSlot(opts: ChunkOpts, isLookahead: boolean): Slot {
    const span: Span = this.tracer.startSpan(
      "chunk.stream",
      {
        attributes: {
          "chunk.job_id": opts.jobId,
          "chunk.resolution": opts.resolution,
          "chunk.is_first": opts.isFirstChunk,
          "chunk.start_s": opts.chunkStartS,
          "chunk.opened_as_lookahead": isLookahead,
        },
      },
      getSessionContext()
    );
    const chunkCtx = trace.setSpan(getSessionContext(), span);

    const slot: Slot = {
      jobId: opts.jobId,
      chunkStartS: opts.chunkStartS,
      chunkEndS: opts.chunkEndS,
      isFirstChunk: opts.isFirstChunk,
      svc: new StreamingService(),
      span,
      chunkCtx,
      opts,
      totalMediaBytes: 0,
      segmentCount: 0,
      ended: false,
      firstMediaSegmentSeen: false,
      isLookahead,
      queuedSegments: [],
      cancelled: false,
      pendingCompletion: false,
      endSpan: (): void => {
        if (slot.ended) return;
        slot.ended = true;
        span.setAttribute("chunk.bytes_streamed", slot.totalMediaBytes);
        span.setAttribute("chunk.segments_received", slot.segmentCount);
        span.end();
      },
      cancel: (reason: string): void => {
        if (slot.ended) return;
        slot.cancelled = true;
        span.addEvent(`chunk_cancelled_by_${reason}`);
        slot.queuedSegments = [];
        slot.endSpan();
        slot.svc.cancel();
      },
    };

    void slot.svc.start(
      opts.jobId,
      async (segData, isInit) => {
        if (slot.isLookahead) {
          slot.queuedSegments.push({ data: segData, isInit });
          return;
        }
        await this.processSegment(slot, segData, isInit);
      },
      (err) => {
        if (!slot.ended) {
          span.addEvent("chunk_error", { message: err.message });
          span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        }
        slot.endSpan();
        opts.onError(err);
      },
      () => {
        slot.endSpan();
        if (slot.isLookahead) {
          slot.pendingCompletion = true;
          return;
        }
        // Foreground path: byte counter is accurate, decide outcome inline.
        const hasRealContent = slot.totalMediaBytes >= clientConfig.playback.minRealChunkBytes;
        const outcome: StreamOutcome = hasRealContent ? "completed" : "no_real_content";
        if (!hasRealContent) {
          span.addEvent("chunk_no_real_content");
        }
        this.dispatchOutcome(slot, outcome);
      },
      chunkCtx
    );

    return slot;
  }

  /** Single per-segment append path — used by live network handler and queue drain. */
  private async processSegment(slot: Slot, segData: ArrayBuffer, isInit: boolean): Promise<void> {
    if (!isInit) {
      slot.totalMediaBytes += segData.byteLength;
      slot.segmentCount += 1;
    }

    // Measures arrival-to-append latency at the chunk-handover seam.
    // Chunk 0 is excluded; drained lookahead "arrival" is drain-reach time, not network arrival.
    let firstAppendSpan: Span | null = null;
    if (!isInit && !slot.opts.isFirstChunk && !slot.firstMediaSegmentSeen) {
      slot.firstMediaSegmentSeen = true;
      const arrivalAtMs = performance.now();
      slot.opts.onFirstMediaSegmentArrived?.(arrivalAtMs);
      const arrivalCurrentTime = this.videoEl.currentTime;
      const arrivalBufferedAhead = this.buffer.getBufferedAheadSeconds(arrivalCurrentTime) ?? 0;
      firstAppendSpan = this.tracer.startSpan(
        "chunk.first_segment_append",
        {
          attributes: {
            "chunk.job_id": slot.opts.jobId,
            "chunk.start_s": slot.opts.chunkStartS,
            "chunk.end_s": slot.opts.chunkEndS,
            "chunk.segment_bytes": segData.byteLength,
            "playback.current_time_s_at_arrival": parseFloat(arrivalCurrentTime.toFixed(2)),
            "playback.buffered_ahead_s_at_arrival": parseFloat(arrivalBufferedAhead.toFixed(2)),
          },
        },
        slot.chunkCtx
      );
    }

    try {
      if (isInit) {
        // See BufferManager.init for why MSE ignores ffmpeg's elst and relies on timestampOffset.
        await this.buffer.setTimestampOffset(slot.opts.chunkStartS);
      }
      await this.buffer.appendSegment(segData);
      firstAppendSpan?.end();
      if (isInit && slot.opts.isFirstChunk) {
        slot.opts.onFirstChunkInit?.();
      }
    } catch (err) {
      if (firstAppendSpan) {
        firstAppendSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: (err as Error).message,
        });
        firstAppendSpan.end();
      }
      this.log.error("Buffer append error", { message: (err as Error).message });
      if (!slot.ended) {
        slot.span.addEvent("chunk_error", { message: (err as Error).message });
        slot.span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (err as Error).message,
        });
      }
      slot.endSpan();
      slot.opts.onError(err as Error);
    }
  }
}
