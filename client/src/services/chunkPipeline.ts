/**
 * Foreground + lookahead streaming slots feeding one BufferManager.
 *
 * Why this exists: the orphan_no_connection safety timer in chunker.ts kills
 * jobs whose `connections` count stays at 0 for 30 s. Before this class, the
 * client only opened chunk N+1's `/stream/<jobId>` fetch *after* chunk N's
 * stream completed — so a prefetched job sat at `connections === 0` for the
 * full duration of chunk N's stream (often >30 s under backpressure) and was
 * killed before the client could connect. Opening the lookahead fetch at
 * prefetch time makes `connections` jump to 1 immediately, satisfying the
 * orphan check without weakening the 30 s safety threshold.
 *
 * The two slots both call into one shared `BufferManager.appendSegment`
 * queue, which already serialises concurrent producers via its single-drain
 * promise chain. No new synchronisation primitive is required.
 */
import { type Span, SpanStatusCode, trace, type Tracer } from "@opentelemetry/api";

import type { ClientLog } from "~/telemetry.js";
import type { Resolution } from "~/types.js";

import type { BufferManager } from "./bufferManager.js";
import { CHUNK_DURATION_S, MIN_REAL_CHUNK_BYTES } from "./playbackConfig.js";
import { getSessionContext } from "./playbackSession.js";
import { StreamingService } from "./streamingService.js";

/** Outcome of a foreground stream completion, passed to the caller's onStreamEnded. */
export type StreamOutcome =
  /** Real content streamed; caller should chain to the next chunk. */
  | "completed"
  /** ffmpeg produced only a placeholder (<MIN_REAL_CHUNK_BYTES); pipeline already
   *  called buffer.markStreamDone(); caller should not chain another chunk. */
  | "no_real_content";

export interface ChunkOpts {
  jobId: string;
  chunkStartS: number;
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

interface Slot {
  jobId: string;
  chunkStartS: number;
  isFirstChunk: boolean;
  svc: StreamingService;
  span: Span;
  opts: ChunkOpts;
  totalMediaBytes: number;
  segmentCount: number;
  ended: boolean;
  firstMediaSegmentSeen: boolean;
  /** True while the slot is the lookahead. Cleared on promotion. While true,
   *  natural stream completion is captured in `pendingOutcome` rather than
   *  fired to the caller — we must not call markStreamDone or chain to the
   *  next chunk while the foreground is still actively appending. */
  isLookahead: boolean;
  /** Set when `svc` completed naturally while the slot was still a lookahead.
   *  Consumed by `promoteLookahead` to fire the deferred callback. */
  pendingOutcome: StreamOutcome | null;
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

  /** Opens the foreground stream. Replaces any existing foreground (used by
   *  initial start, seek, and the resolution-switch promotion). */
  startForeground(opts: ChunkOpts): void {
    this.foreground?.cancel("foreground_replaced");
    this.foreground = this.openSlot(opts, /* isLookahead */ false);
  }

  /** Opens the lookahead stream at prefetch time. The fetch starts pumping
   *  bytes immediately; segments funnel into the same BufferManager queue
   *  behind any pending foreground appends. */
  openLookahead(opts: ChunkOpts): void {
    this.lookahead?.cancel("lookahead_replaced");
    this.lookahead = this.openSlot(opts, /* isLookahead */ true);
  }

  /** True if a lookahead slot is currently open. Used by PlaybackController
   *  to gate prefetch fire ("don't prefetch if one is already in flight"). */
  hasLookahead(): boolean {
    return this.lookahead !== null;
  }

  /** Promotes the lookahead slot to foreground (called by PlaybackController
   *  when the foreground stream's onStreamEnded fires). Returns the new
   *  foreground's chunkStartS so the controller can update its chunkEnd. */
  promoteLookahead(): { chunkStartS: number } {
    if (!this.lookahead) {
      throw new Error("ChunkPipeline.promoteLookahead: no lookahead to promote");
    }
    const slot = this.lookahead;
    this.foreground = slot;
    this.lookahead = null;
    slot.isLookahead = false;
    // If the lookahead's stream already completed before promotion, fire its
    // deferred onStreamEnded now so the caller can chain to the next chunk.
    if (slot.pendingOutcome !== null) {
      this.dispatchOutcome(slot, slot.pendingOutcome);
      slot.pendingOutcome = null;
    }
    return { chunkStartS: slot.chunkStartS };
  }

  /** Cancels both slots. Used on teardown, seek, resolution-switch. */
  cancel(reason: string): void {
    this.foreground?.cancel(reason);
    this.lookahead?.cancel(reason);
    this.foreground = null;
    this.lookahead = null;
  }

  /** Cancels only the lookahead. Used when prefetch becomes invalid (e.g. seek
   *  invalidates the prefetched chunk but the foreground keeps streaming). */
  cancelLookahead(reason: string): void {
    this.lookahead?.cancel(reason);
    this.lookahead = null;
  }

  /** Pause both slots' readers (called by BufferManager backpressure). Both
   *  must pause together to bound the BufferManager append queue — if only
   *  the foreground paused, the lookahead would keep reading and queueing. */
  pauseAll(): void {
    this.foreground?.svc.pause();
    this.lookahead?.svc.pause();
  }

  /** Resume both slots' readers. */
  resumeAll(): void {
    this.foreground?.svc.resume();
    this.lookahead?.svc.resume();
  }

  /** Acts on a stream outcome — called for foreground naturally and for the
   *  lookahead's deferred outcome on promotion. Owns the markStreamDone call
   *  for `no_real_content`, which must NOT happen while the foreground is
   *  still appending (would call MediaSource.endOfStream and break MSE). */
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
      isFirstChunk: opts.isFirstChunk,
      svc: new StreamingService(),
      span,
      opts,
      totalMediaBytes: 0,
      segmentCount: 0,
      ended: false,
      firstMediaSegmentSeen: false,
      isLookahead,
      pendingOutcome: null,
      endSpan: (): void => {
        if (slot.ended) return;
        slot.ended = true;
        span.setAttribute("chunk.bytes_streamed", slot.totalMediaBytes);
        span.setAttribute("chunk.segments_received", slot.segmentCount);
        span.end();
      },
      cancel: (reason: string): void => {
        if (slot.ended) return;
        span.addEvent(`chunk_cancelled_by_${reason}`);
        slot.endSpan();
        slot.svc.cancel();
      },
    };

    void slot.svc.start(
      opts.jobId,
      0,
      async (segData, isInit) => {
        // Continuation chunks must NOT re-append the init segment — would
        // clobber the SourceBuffer's existing init and stall the decoder.
        if (isInit && !opts.isFirstChunk) return;

        if (!isInit) {
          slot.totalMediaBytes += segData.byteLength;
          slot.segmentCount += 1;
        }

        // Measures arrival-to-append latency for the first media segment of a
        // continuation chunk — the chunk-handover seam where stalls live.
        // Chunk 0 is excluded because its first-segment timing is dominated
        // by the MSE init handshake, not the handover.
        let firstAppendSpan: Span | null = null;
        if (!isInit && !opts.isFirstChunk && !slot.firstMediaSegmentSeen) {
          slot.firstMediaSegmentSeen = true;
          const arrivalAtMs = performance.now();
          opts.onFirstMediaSegmentArrived?.(arrivalAtMs);
          const arrivalCurrentTime = this.videoEl.currentTime;
          const arrivalBufferedAhead = this.buffer.getBufferedAheadSeconds(arrivalCurrentTime) ?? 0;
          firstAppendSpan = this.tracer.startSpan(
            "chunk.first_segment_append",
            {
              attributes: {
                "chunk.job_id": opts.jobId,
                "chunk.number": Math.floor(opts.chunkStartS / CHUNK_DURATION_S),
                "chunk.start_s": opts.chunkStartS,
                "chunk.segment_bytes": segData.byteLength,
                "playback.current_time_s_at_arrival": parseFloat(arrivalCurrentTime.toFixed(2)),
                "playback.buffered_ahead_s_at_arrival": parseFloat(arrivalBufferedAhead.toFixed(2)),
              },
            },
            chunkCtx
          );
        }

        try {
          await this.buffer.appendSegment(segData);
          firstAppendSpan?.end();
          if (isInit && opts.isFirstChunk) {
            opts.onFirstChunkInit?.();
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
            span.addEvent("chunk_error", { message: (err as Error).message });
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: (err as Error).message,
            });
          }
          slot.endSpan();
          opts.onError(err as Error);
        }
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
        // Chunks with < MIN_REAL_CHUNK_BYTES of media are placeholder output
        // from ffmpeg when the seek position is past encoded content.
        const hasRealContent = slot.totalMediaBytes >= MIN_REAL_CHUNK_BYTES;
        const outcome: StreamOutcome = hasRealContent ? "completed" : "no_real_content";
        if (!hasRealContent) {
          span.addEvent("chunk_no_real_content");
        }
        slot.endSpan();
        // If still a lookahead, defer the outcome until promotion. The
        // pipeline's invariant is that markStreamDone (the side-effect of
        // no_real_content) must NOT fire while the foreground is still
        // appending — would call MediaSource.endOfStream() and break MSE.
        if (slot.isLookahead) {
          slot.pendingOutcome = outcome;
          return;
        }
        this.dispatchOutcome(slot, outcome);
      },
      chunkCtx
    );

    return slot;
  }
}
