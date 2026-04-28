import { type Context, context } from "@opentelemetry/api";

import { getClientLogger } from "~/telemetry.js";

const log = getClientLogger("streamingService");

export type SegmentCallback = (data: ArrayBuffer, isInit: boolean) => Promise<void>;
export type ErrorCallback = (err: Error) => void;

export class StreamingService {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private abortController: AbortController | null = null;
  private paused = false;
  private resumeResolve: (() => void) | null = null;

  async start(
    jobId: string,
    onSegment: SegmentCallback,
    onError: ErrorCallback,
    onDone: () => void,
    parentContext: Context
  ): Promise<void> {
    this.abortController = new AbortController();
    let response: Response;

    const url = `/stream/${jobId}`;
    log.info(`Fetching ${url}`, { url, job_id: jobId });

    try {
      // context.with() makes the chunk span the active context for the
      // synchronous fetch() call so FetchInstrumentation injects the correct
      // traceparent — linking server's stream.request under the chunk.stream span.
      const controller = this.abortController;
      response = await context.with(parentContext, () =>
        fetch(url, { signal: controller?.signal })
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        log.error(`Fetch failed: ${(err as Error).message}`, {
          job_id: jobId,
          message: (err as Error).message,
        });
        onError(err as Error);
      }
      return;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const msg = `HTTP ${response.status}${text ? ` — ${text}` : ""}`;
      log.error(`HTTP ${response.status} error${text ? `: ${text}` : ""}`, {
        job_id: jobId,
        status: response.status,
        body: text,
      });
      onError(new Error(`Stream request failed: ${msg}`));
      return;
    }

    if (!response.body) {
      log.error("No response body", { job_id: jobId });
      onError(new Error("No response body"));
      return;
    }

    log.info(`HTTP ${response.status} — stream open for job ${jobId.slice(0, 8)}`, {
      job_id: jobId,
      status: response.status,
    });

    this.reader = response.body.getReader();
    let buffer = new Uint8Array(0);
    let isFirstSegment = true;
    let segmentCount = 0;

    try {
      // This loop is NOT a busy-wait. Each iteration suspends on
      // `reader.read()`, which resolves only when the next network chunk
      // arrives. The pause path also suspends: it stores the Promise's
      // `resolve` callback in `resumeResolve` so that calling `resume()`
      // (from BufferManager's back-pressure callback) unblocks the loop
      // without any polling.
      while (true) {
        // Snapshot the reader at the top of every iteration. cancel() (called
        // by seek/teardown/resolution-switch) sets this.reader = null, and
        // can fire while this loop is suspended at any await below. Without
        // this snapshot, the next `this.reader.read()` after cancel hits a
        // null deref — caught in trace 5d5b5137… as
        // `Stream error: can't access property "read", this.reader is null`
        // after two rapid seeks.
        const reader = this.reader;
        if (!reader) {
          log.info("Reader nulled — exiting stream loop cleanly", { job_id: jobId });
          return;
        }
        if (this.paused) {
          // Suspend here until resume() calls this.resumeResolve().
          await new Promise<void>((resolve) => {
            this.resumeResolve = resolve;
          });
          if (!this.reader) return; // cancelled during pause
          continue; // re-snapshot at top
        }

        const { done, value } = await reader.read();
        if (done) break;

        // Concat incoming bytes onto buffer
        const merged = new Uint8Array(buffer.length + value.length);
        merged.set(buffer, 0);
        merged.set(value, buffer.length);
        buffer = merged;

        // Extract all complete length-prefixed frames.
        // Await each onSegment call so back-pressure can fire between segments —
        // without this, a fast cache-hit response floods the append queue with
        // hundreds of segments before checkForwardBuffer() has a chance to pause
        // the stream, overflowing the SourceBuffer quota.
        while (buffer.length >= 4) {
          const view = new DataView(buffer.buffer, buffer.byteOffset);
          const segLen = view.getUint32(0, false); // big-endian

          if (buffer.length < 4 + segLen) break;

          const segData = buffer.slice(4, 4 + segLen).buffer;
          await onSegment(segData, isFirstSegment);
          // cancel() can fire during await onSegment — bail before the next
          // segment slice or pause-await touches this.reader.
          if (!this.reader) return;
          isFirstSegment = false;
          segmentCount++;

          buffer = buffer.slice(4 + segLen);

          // Re-check pause after each segment so back-pressure applies immediately
          // rather than only at the top of the outer reader.read() loop.
          // Same suspend-on-promise pattern: resume() resolves this via resumeResolve.
          if (this.paused) {
            await new Promise<void>((resolve) => {
              this.resumeResolve = resolve;
            });
            if (!this.reader) return; // cancelled during pause
          }
        }
      }
      log.info(`Stream complete — ${segmentCount} segments received`, {
        job_id: jobId,
        segment_count: segmentCount,
      });
      onDone();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        log.error(`Stream error: ${(err as Error).message}`, {
          job_id: jobId,
          message: (err as Error).message,
        });
        onError(err as Error);
      }
    }
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.resumeResolve?.();
    this.resumeResolve = null;
  }

  cancel(): void {
    this.paused = false;
    this.resumeResolve?.();
    this.resumeResolve = null;
    this.abortController?.abort();
    this.reader?.cancel().catch(() => {});
    this.reader = null;
    log.info("Stream cancelled");
  }
}
