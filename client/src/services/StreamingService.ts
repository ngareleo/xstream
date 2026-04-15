import { StreamingLogger } from "./StreamingLogger.js";

export type SegmentCallback = (data: ArrayBuffer, isInit: boolean) => void;
export type ErrorCallback = (err: Error) => void;

export class StreamingService {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private abortController: AbortController | null = null;
  private paused = false;
  private resumeResolve: (() => void) | null = null;

  async start(
    jobId: string,
    fromIndex: number,
    onSegment: SegmentCallback,
    onError: ErrorCallback,
    onDone: () => void
  ): Promise<void> {
    this.abortController = new AbortController();
    let response: Response;

    const url = `/stream/${jobId}${fromIndex > 0 ? `?from=${fromIndex}` : ""}`;
    StreamingLogger.push({ category: "STREAM", message: `Fetching ${url}`, isError: false });

    try {
      response = await fetch(url, { signal: this.abortController.signal });
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        StreamingLogger.push({
          category: "STREAM",
          message: (err as Error).message,
          isError: true,
        });
        onError(err as Error);
      }
      return;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const msg = `HTTP ${response.status}${text ? ` — ${text}` : ""}`;
      StreamingLogger.push({ category: "STREAM", message: msg, isError: true });
      onError(new Error(`Stream request failed: ${msg}`));
      return;
    }

    if (!response.body) {
      StreamingLogger.push({ category: "STREAM", message: "No response body", isError: true });
      onError(new Error("No response body"));
      return;
    }

    StreamingLogger.push({
      category: "STREAM",
      message: `HTTP ${response.status} — stream open`,
      isError: false,
    });

    this.reader = response.body.getReader();
    let buffer = new Uint8Array(0);
    let isFirstSegment = true;

    try {
      while (true) {
        if (this.paused) {
          await new Promise<void>((resolve) => {
            this.resumeResolve = resolve;
          });
          if (!this.reader) return; // cancelled during pause
        }

        const { done, value } = await this.reader.read();
        if (done) break;

        // Concat incoming bytes onto buffer
        const merged = new Uint8Array(buffer.length + value.length);
        merged.set(buffer, 0);
        merged.set(value, buffer.length);
        buffer = merged;

        // Extract all complete length-prefixed frames
        while (buffer.length >= 4) {
          const view = new DataView(buffer.buffer, buffer.byteOffset);
          const segLen = view.getUint32(0, false); // big-endian

          if (buffer.length < 4 + segLen) break;

          const segData = buffer.slice(4, 4 + segLen).buffer;
          StreamingLogger.push({
            category: "STREAM",
            message: `Segment parsed — ${segLen}B${isFirstSegment ? " (init)" : ""}`,
            isError: false,
          });
          onSegment(segData, isFirstSegment);
          isFirstSegment = false;

          buffer = buffer.slice(4 + segLen);
        }
      }
      StreamingLogger.push({ category: "STREAM", message: "Stream complete", isError: false });
      onDone();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        StreamingLogger.push({
          category: "STREAM",
          message: (err as Error).message,
          isError: true,
        });
        onError(err as Error);
      }
    }
  }

  pause(): void {
    this.paused = true;
    StreamingLogger.push({ category: "STREAM", message: "Paused (buffer full)", isError: false });
  }

  resume(): void {
    this.paused = false;
    this.resumeResolve?.();
    this.resumeResolve = null;
    StreamingLogger.push({ category: "STREAM", message: "Resumed", isError: false });
  }

  cancel(): void {
    this.paused = false;
    this.resumeResolve?.();
    this.resumeResolve = null;
    this.abortController?.abort();
    this.reader?.cancel().catch(() => {});
    this.reader = null;
    StreamingLogger.push({ category: "STREAM", message: "Cancelled", isError: false });
  }
}
