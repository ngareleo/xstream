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

    try {
      const url = `/stream/${jobId}${fromIndex > 0 ? `?from=${fromIndex}` : ""}`;
      response = await fetch(url, { signal: this.abortController.signal });
    } catch (err) {
      if ((err as Error).name !== "AbortError") onError(err as Error);
      return;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      onError(new Error(`Stream request failed: ${response.status}${text ? ` — ${text}` : ""}`));
      return;
    }

    if (!response.body) {
      onError(new Error("No response body"));
      return;
    }

    this.reader = response.body.getReader();
    let buffer = new Uint8Array(0);
    let isFirstSegment = true;

    try {
      while (true) {
        if (this.paused) {
          await new Promise<void>((resolve) => {
            this.resumeResolve = resolve;
          });
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
          onSegment(segData, isFirstSegment);
          isFirstSegment = false;

          buffer = buffer.slice(4 + segLen);
        }
      }
      onDone();
    } catch (err) {
      if ((err as Error).name !== "AbortError") onError(err as Error);
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
  }
}
