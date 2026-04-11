/**
 * Scan store — tracks whether a library scan is in progress and notifies
 * subscribers when the state changes. Mirrors the jobStore.ts pattern.
 */

let scanning = false;
const listeners = new Set<(scanning: boolean) => void>();

export function isScanRunning(): boolean {
  return scanning;
}

export function markScanStarted(): void {
  scanning = true;
  notify();
}

export function markScanEnded(): void {
  scanning = false;
  notify();
}

function notify(): void {
  for (const fn of listeners) {
    try {
      fn(scanning);
    } catch {
      listeners.delete(fn);
    }
  }
}

/**
 * Returns an async iterable that emits the current scan state whenever it
 * changes. The iterable runs until the subscriber disposes the iterator via
 * return().
 */
export function subscribeToScan(): AsyncIterable<boolean> {
  return {
    [Symbol.asyncIterator]() {
      let done = false;
      let resolve: ((result: IteratorResult<boolean>) => void) | undefined;
      // Holds a state change that arrived before next() was awaiting, so it
      // isn't dropped. A new change overwrites the previous pending value
      // (only the latest state matters for scan progress).
      let pending: { value: boolean } | undefined;

      function listener(value: boolean): void {
        if (done) return;
        if (resolve) {
          const r = resolve;
          resolve = undefined;
          pending = undefined;
          r({ value, done: false });
        } else {
          pending = { value };
        }
      }

      listeners.add(listener);

      return {
        async next(): Promise<IteratorResult<boolean>> {
          if (done) return { value: undefined as never, done: true };
          if (pending) {
            const { value } = pending;
            pending = undefined;
            return { value, done: false };
          }
          return new Promise<IteratorResult<boolean>>((r) => {
            resolve = r;
          });
        },

        async return(): Promise<IteratorResult<boolean>> {
          done = true;
          listeners.delete(listener);
          pending = undefined;
          // Unblock any pending next() so it doesn't hang after the for-await exits
          resolve?.({ value: undefined as never, done: true });
          resolve = undefined;
          return { value: undefined as never, done: true };
        },
      };
    },
  };
}
