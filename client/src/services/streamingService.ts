import { type Context, context } from "@opentelemetry/api";

import { streamUrl } from "~/config/rustOrigin.js";
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

    const url = streamUrl(jobId);
    log.info(`Fetching ${url}`, { url, job_id: jobId });

    try {
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
      while (true) {
        // Snapshot reader to guard against null deref during pause/cancel; see trace 5d5b5137.
        const reader = this.reader;
        if (!reader) {
          log.info("Reader nulled — exiting stream loop cleanly", { job_id: jobId });
          return;
        }
        if (this.paused) {
          await new Promise<void>((resolve) => {
            this.resumeResolve = resolve;
          });
          if (!this.reader) return; // cancelled during pause
          continue; // re-snapshot at top
        }

        const { done, value } = await reader.read();
        if (done) break;

        const merged = new Uint8Array(buffer.length + value.length);
        merged.set(buffer, 0);
        merged.set(value, buffer.length);
        buffer = merged;

        // Await onSegment to allow back-pressure between segments.
        while (buffer.length >= 4) {
          const view = new DataView(buffer.buffer, buffer.byteOffset);
          const segLen = view.getUint32(0, false); // big-endian

          if (buffer.length < 4 + segLen) break;

          const segData = buffer.slice(4, 4 + segLen).buffer;
          await onSegment(segData, isFirstSegment);
          if (!this.reader) return;
          isFirstSegment = false;
          segmentCount++;

          buffer = buffer.slice(4 + segLen);

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
