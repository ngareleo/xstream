const FORWARD_BUFFER_TARGET_S = 20;
const FORWARD_BUFFER_RESUME_S = 15;
const BACK_BUFFER_KEEP_S = 5;

export type BufferPauseCallback = () => void;
export type BufferResumeCallback = () => void;

export class BufferManager {
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private videoEl: HTMLVideoElement;
  private onPause: BufferPauseCallback;
  private onResume: BufferResumeCallback;
  private appendQueue: ArrayBuffer[] = [];
  private isAppending = false;
  private streamDone = false;

  constructor(
    videoEl: HTMLVideoElement,
    onPause: BufferPauseCallback,
    onResume: BufferResumeCallback
  ) {
    this.videoEl = videoEl;
    this.onPause = onPause;
    this.onResume = onResume;
  }

  init(mimeType: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ms = new MediaSource();
      this.mediaSource = ms;
      this.videoEl.src = URL.createObjectURL(ms);

      ms.addEventListener(
        "sourceopen",
        () => {
          try {
            this.sourceBuffer = ms.addSourceBuffer(mimeType);
            this.sourceBuffer.mode = "sequence";
            resolve();
          } catch (err) {
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
      } catch (err) {
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
    }
  }

  private checkForwardBuffer(): void {
    const sb = this.sourceBuffer;
    if (!sb || sb.buffered.length === 0) return;

    const bufferedAhead = sb.buffered.end(sb.buffered.length - 1) - this.videoEl.currentTime;

    if (bufferedAhead > FORWARD_BUFFER_TARGET_S) {
      this.onPause();
    } else if (bufferedAhead < FORWARD_BUFFER_RESUME_S) {
      this.onResume();
    }
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
  }

  teardown(): void {
    const src = this.videoEl.src;
    this.videoEl.src = "";
    if (src) URL.revokeObjectURL(src);
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.appendQueue = [];
    this.isAppending = false;
  }
}
