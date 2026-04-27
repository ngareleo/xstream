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
  /** Server-side segment skip — sent as `?from=K` on the /stream/<jobId>
   *  request. Used by the seek path to skip segments that land entirely
   *  behind the user's seekTime (Chrome MSE auto-evicts those frames as
   *  they're appended in `mode="segments"`, wasting bandwidth + append
   *  serialization time). 0 / undefined means start at the chunk's first
   *  segment, which is the right default for initial play, MSE recovery,
   *  resolution switch, and chunk N→N+1 continuation. */
  fromIndex?: number;
}

interface QueuedSegment {
  data: ArrayBuffer;
  isInit: boolean;
}

interface Slot {
  jobId: string;
  chunkStartS: number;
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
   *  foreground's chunkStartS so the controller can update its chunkEnd
   *  synchronously, and a `drain` promise for callers that need to wait
   *  until the queued segments are appended + any deferred outcome is
   *  dispatched. Production callers can ignore `drain`; tests await it. */
  promoteLookahead(): { chunkStartS: number; drain: Promise<void> } {
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
    return { chunkStartS: slot.chunkStartS, drain };
  }

  /** Drains a slot's queued lookahead segments through the same per-segment
   *  pipeline that the live network path uses, then dispatches any
   *  outcome captured while the slot was still a lookahead. Stops if the
   *  slot is cancelled mid-drain.
   *
   *  Awaits `buffer.waitIfPaused()` between iterations so the drain respects
   *  backpressure the same way the live `streamingService` reader loop does.
   *  Without this gate the drain dumps every queued lookahead segment in a
   *  tight loop at promotion — at 4k that's 200–400 MB into MSE in 1–2 s,
   *  which is the chunk-handover bloat from trace `e699c0ae…`. */
  private async drainAndDispatch(slot: Slot): Promise<void> {
    const queue = slot.queuedSegments;
    slot.queuedSegments = [];
    for (const seg of queue) {
      // `cancelled` (not `ended`) is the right signal: `ended` flips on
      // natural span end too, which is exactly when drain SHOULD run.
      if (slot.cancelled) return;
      await this.buffer.waitIfPaused();
      if (slot.cancelled) return;
      await this.processSegment(slot, seg.data, seg.isInit);
    }
    if (slot.pendingCompletion) {
      slot.pendingCompletion = false;
      // Decide the outcome NOW with the post-drain byte counter — deferring
      // to here is what lets the lookahead-queueing path produce the same
      // outcome as the live foreground path would for the same content.
      const hasRealContent = slot.totalMediaBytes >= MIN_REAL_CHUNK_BYTES;
      if (!hasRealContent) {
        slot.span.addEvent("chunk_no_real_content");
      }
      this.dispatchOutcome(slot, hasRealContent ? "completed" : "no_real_content");
    }
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

  /** Pause only the lookahead's reader. Used by the user-pause prefetch path:
   *  open chunk N+1 as a lookahead so server keeps the connection alive past
   *  the orphan_no_connection 30 s timer, but immediately suspend the read so
   *  segments don't accumulate in the slot's queuedSegments RAM buffer for
   *  the duration of the pause (could otherwise reach 200-400 MB on a 4K
   *  pre-encode). ffmpeg keeps writing segments to disk regardless. */
  pauseLookahead(): void {
    this.lookahead?.svc.pause();
  }

  /** Resume only the lookahead's reader. Paired with pauseLookahead — called
   *  on user resume so the lookahead starts pulling its on-disk segments
   *  through to the queue, ready for promotion at the next chunk handover. */
  resumeLookahead(): void {
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
        // Drop any queued lookahead segments — caller is tearing down or
        // replacing this slot, so appending them would just race the new
        // slot's appends.
        slot.queuedSegments = [];
        slot.endSpan();
        slot.svc.cancel();
      },
    };

    void slot.svc.start(
      opts.jobId,
      opts.fromIndex ?? 0,
      async (segData, isInit) => {
        // Lookahead slots queue segments instead of appending — see
        // `Slot.isLookahead` doc for the elst/init-clash rationale. The
        // queue is drained on promotion via `drainAndDispatch`.
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
        // If still a lookahead, defer EVERYTHING until promotion-drain:
        // the outcome decision (which depends on totalMediaBytes — only
        // updated by processSegment, which the queueing path skips), the
        // markStreamDone call (must not fire while foreground is still
        // appending), and onStreamEnded (must not chain to next chunk
        // until current chunk's data is in the SourceBuffer).
        if (slot.isLookahead) {
          slot.pendingCompletion = true;
          return;
        }
        // Foreground path: byte counter is accurate, decide outcome inline.
        const hasRealContent = slot.totalMediaBytes >= MIN_REAL_CHUNK_BYTES;
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

  /** Single per-segment append path — used both by the live network handler
   *  (foreground slot) and by the queue drain (post-promotion). Owns the
   *  byte/segment counters, the chunk.first_segment_append span, and the
   *  error path. */
  private async processSegment(slot: Slot, segData: ArrayBuffer, isInit: boolean): Promise<void> {
    if (!isInit) {
      slot.totalMediaBytes += segData.byteLength;
      slot.segmentCount += 1;
    }

    // Measures arrival-to-append latency for the first media segment of a
    // continuation chunk — the chunk-handover seam where stalls live.
    // Chunk 0 is excluded because its first-segment timing is dominated by
    // the MSE init handshake, not the handover. For drained lookahead
    // segments, "arrival" is the moment the drain reaches the segment, not
    // the moment the network delivered it — that captures the visible
    // append latency a user would experience.
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
            "chunk.number": Math.floor(slot.opts.chunkStartS / CHUNK_DURATION_S),
            "chunk.start_s": slot.opts.chunkStartS,
            "chunk.segment_bytes": segData.byteLength,
            "playback.current_time_s_at_arrival": parseFloat(arrivalCurrentTime.toFixed(2)),
            "playback.buffered_ahead_s_at_arrival": parseFloat(arrivalBufferedAhead.toFixed(2)),
          },
        },
        slot.chunkCtx
      );
    }

    try {
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
