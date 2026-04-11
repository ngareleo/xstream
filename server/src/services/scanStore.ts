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

      function listener(value: boolean): void {
        if (done) return;
        const r = resolve;
        resolve = undefined;
        r?.({ value, done: false });
      }

      listeners.add(listener);

      return {
        async next(): Promise<IteratorResult<boolean>> {
          if (done) return { value: undefined as never, done: true };
          return new Promise<IteratorResult<boolean>>((r) => {
            resolve = r;
          });
        },

        async return(): Promise<IteratorResult<boolean>> {
          done = true;
          listeners.delete(listener);
          // Unblock any pending next() so it doesn't hang after the for-await exits
          resolve?.({ value: undefined as never, done: true });
          resolve = undefined;
          return { value: undefined as never, done: true };
        },
      };
    },
  };
}
