/**
 * Single RAF tick that drives every per-frame poll the playback subsystem
 * needs — startup-buffer check, prefetch trigger, background-buffer ready
 * check during a resolution swap, and the StallTracker's spinner debounce.
 *
 * Why one tick: those four loops were previously independent
 * `requestAnimationFrame` chains plus a `setTimeout` — five different
 * callback owners, all checking elapsed time or buffered state at display
 * refresh rate. Consolidating them gives a single named place where playback
 * timing decisions live, and reduces five RAF callbacks per frame to one.
 *
 * Lifecycle: `register(handler)` returns an unregister function. Handlers
 * receive `nowMs` (a `DOMHighResTimeStamp` from RAF) and return `true` to
 * stay registered or `false` to self-deregister. The ticker auto-starts on
 * the first registration and auto-stops when the last handler deregisters,
 * so callers never need to think about start/stop. `shutdown()` clears all
 * handlers — called by `PlaybackController.resetForNewSession`.
 *
 * Handlers must be safe to invoke after the session has torn down — by the
 * time `shutdown` clears them they've already been called once with stale
 * state. Most handlers guard with `if (!this.buffer) return false;` to
 * deregister cleanly when the controller's per-session state goes away.
 */

export type TickHandler = (nowMs: DOMHighResTimeStamp) => boolean;

export class PlaybackTicker {
  private handlers = new Map<symbol, TickHandler>();
  private rafHandle: number | null = null;

  /** Register a handler. Returns an unregister function. The ticker auto-
   *  starts on the first registration. */
  register(handler: TickHandler): () => void {
    const id = Symbol();
    this.handlers.set(id, handler);
    if (this.rafHandle === null) this.start();
    return () => {
      this.handlers.delete(id);
      if (this.handlers.size === 0) this.stop();
    };
  }

  /** Cancel all handlers and stop the tick. Used by PlaybackController on
   *  teardown / new session — no caller needs to track per-handler unregister
   *  functions for the global cleanup path. */
  shutdown(): void {
    this.handlers.clear();
    this.stop();
  }

  private start(): void {
    if (this.rafHandle !== null) return;
    const tick = (nowMs: DOMHighResTimeStamp): void => {
      // Snapshot the handler list — a handler may register or unregister
      // others mid-tick, and we don't want to skip or double-visit.
      for (const [id, handler] of [...this.handlers]) {
        if (!this.handlers.has(id)) continue;
        const keep = handler(nowMs);
        if (!keep) this.handlers.delete(id);
      }
      if (this.handlers.size > 0) {
        this.rafHandle = requestAnimationFrame(tick);
      } else {
        this.rafHandle = null;
      }
    };
    this.rafHandle = requestAnimationFrame(tick);
  }

  private stop(): void {
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }
}
