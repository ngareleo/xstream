import { StreamingLogger } from "./StreamingLogger.js";

const DEFAULT_FORWARD_BUFFER_TARGET_S = 20;
const BACK_BUFFER_KEEP_S = 5;

export type BufferPauseCallback = () => void;
export type BufferResumeCallback = () => void;

export class BufferManager {
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private objectUrl: string | null = null;
  private videoEl: HTMLVideoElement;
  private onPause: BufferPauseCallback;
  private onResume: BufferResumeCallback;
  private appendQueue: ArrayBuffer[] = [];
  private isAppending = false;
  private streamDone = false;
  private forwardTarget: number;
  private forwardResume: number;

  constructor(
    videoEl: HTMLVideoElement,
    onPause: BufferPauseCallback,
    onResume: BufferResumeCallback,
    forwardTargetSeconds = DEFAULT_FORWARD_BUFFER_TARGET_S
  ) {
    this.videoEl = videoEl;
    this.onPause = onPause;
    this.onResume = onResume;
    this.forwardTarget = forwardTargetSeconds;
    this.forwardResume = forwardTargetSeconds * 0.75;
  }

  /** Buffered end in seconds (0 if nothing buffered yet). */
  get bufferedEnd(): number {
    const sb = this.sourceBuffer;
    if (!sb || sb.buffered.length === 0) return 0;
    return sb.buffered.end(sb.buffered.length - 1);
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
            this.sourceBuffer.mode = "sequence";
            StreamingLogger.push({
              category: "BUFFER",
              message: "MSE open — sourceBuffer added (mode=sequence)",
              isError: false,
            });
            resolve();
          } catch (err) {
            StreamingLogger.push({
              category: "BUFFER",
              message: `addSourceBuffer failed: ${(err as Error).message}`,
              isError: true,
            });
            reject(err);
          }
        },
        { once: true }
      );
    });
  }

  async appendSegment(data: ArrayBuffer): Promise<void> {
    this.appendQueue.push(data);
    if (!this.isAppending) {
      await this.drainQueue();
    }
  }

  private async drainQueue(): Promise<void> {
    this.isAppending = true;
    while (this.appendQueue.length > 0) {
      const data = this.appendQueue.shift();
      if (data === undefined) break;
      const sb = this.sourceBuffer;
      if (!sb) break;
      await this.waitForUpdateEnd();
      try {
        sb.appendBuffer(data);
        await this.waitForUpdateEnd();
        const bufferedEnd = sb.buffered.length > 0 ? sb.buffered.end(sb.buffered.length - 1) : 0;
        StreamingLogger.push({
          category: "BUFFER",
          message: `Appended ${data.byteLength}B — buffered to ${bufferedEnd.toFixed(2)}s`,
          isError: false,
        });
      } catch (err) {
        StreamingLogger.push({
          category: "BUFFER",
          message: `appendBuffer error: ${(err as Error).message}`,
          isError: true,
        });
        console.error("[BufferManager] appendBuffer error:", err);
      }
      await this.evictBackBuffer();
      this.checkForwardBuffer();
    }
    this.isAppending = false;

    if (this.streamDone) {
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

  private async evictBackBuffer(): Promise<void> {
    const sb = this.sourceBuffer;
    if (!sb || sb.buffered.length === 0) return;

    const evictEnd = this.videoEl.currentTime - BACK_BUFFER_KEEP_S;
    const bufStart = sb.buffered.start(0);

    if (bufStart < evictEnd) {
      await this.waitForUpdateEnd();
      sb.remove(bufStart, evictEnd);
      await this.waitForUpdateEnd();
      StreamingLogger.push({
        category: "BUFFER",
        message: `Evicted [${bufStart.toFixed(1)}s, ${evictEnd.toFixed(1)}s)`,
        isError: false,
      });
    }
  }

  private checkForwardBuffer(): void {
    const sb = this.sourceBuffer;
    if (!sb || sb.buffered.length === 0) return;

    const bufferedAhead = sb.buffered.end(sb.buffered.length - 1) - this.videoEl.currentTime;

    if (bufferedAhead > this.forwardTarget) {
      StreamingLogger.push({
        category: "BUFFER",
        message: `Forward buffer ${bufferedAhead.toFixed(1)}s — pausing`,
        isError: false,
      });
      this.onPause();
    } else if (bufferedAhead < this.forwardResume) {
      StreamingLogger.push({
        category: "BUFFER",
        message: `Forward buffer ${bufferedAhead.toFixed(1)}s — resuming`,
        isError: false,
      });
      this.onResume();
    }
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
      // Attach to a temporary offscreen element — sourceopen only fires when the
      // MediaSource is connected to a media element.
      const tmp = document.createElement("video");
      this.objectUrl = URL.createObjectURL(ms);
      tmp.src = this.objectUrl;

      ms.addEventListener(
        "sourceopen",
        () => {
          try {
            this.sourceBuffer = ms.addSourceBuffer(mimeType);
            this.sourceBuffer.mode = "sequence";
            StreamingLogger.push({
              category: "BUFFER",
              message: "Background MSE open — sourceBuffer added (mode=sequence)",
              isError: false,
            });
            resolve(this.objectUrl as string);
          } catch (err) {
            StreamingLogger.push({
              category: "BUFFER",
              message: `Background addSourceBuffer failed: ${(err as Error).message}`,
              isError: true,
            });
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
        StreamingLogger.push({ category: "BUFFER", message: "endOfStream()", isError: false });
      } catch {
        // May already be closed
      }
    }
  }

  async seek(timeSeconds: number): Promise<void> {
    const sb = this.sourceBuffer;
    if (!sb) return;
    await this.waitForUpdateEnd();
    sb.remove(0, Infinity);
    await this.waitForUpdateEnd();
    this.appendQueue = [];
    this.isAppending = false;
    this.streamDone = false;
    this.videoEl.currentTime = timeSeconds;
    StreamingLogger.push({
      category: "BUFFER",
      message: `Seek flush → ${timeSeconds.toFixed(2)}s`,
      isError: false,
    });
  }

  /**
   * Tears down the MediaSource and revokes the ObjectURL.
   * Pass `clearVideoEl = true` (default) to also clear videoEl.src — omit this
   * when tearing down a foreground buffer whose src has already been replaced by
   * the background buffer swap.
   */
  teardown(clearVideoEl = true): void {
    if (clearVideoEl) {
      this.videoEl.src = "";
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.appendQueue = [];
    this.isAppending = false;
    this.streamDone = false;
    StreamingLogger.push({
      category: "BUFFER",
      message: "Teardown — ObjectURL revoked",
      isError: false,
    });
  }
}
