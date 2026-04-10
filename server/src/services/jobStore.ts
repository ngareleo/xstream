import type { ActiveJob } from "../types.js";

const store = new Map<string, ActiveJob>();

export function getJob(id: string): ActiveJob | undefined {
  return store.get(id);
}

export function setJob(job: ActiveJob): void {
  store.set(job.id, job);
}

export function removeJob(id: string): void {
  store.delete(id);
}

export function getAllJobs(): ActiveJob[] {
  return Array.from(store.values());
}

/**
 * Returns an async iterable that emits the current job state whenever a new
 * segment arrives or the job status changes. The iterable completes when the
 * job reaches a terminal state (complete / error) or when the subscriber
 * disposes the iterator (via return()).
 */
export function subscribeToJob(localId: string): AsyncIterable<ActiveJob | null> {
  return {
    [Symbol.asyncIterator]() {
      let resolve: (() => void) | undefined;
      let pending = false;
      let done = false;

      const controller = {
        enqueue(_: null) {
          if (resolve) {
            resolve();
            resolve = undefined;
          } else {
            pending = true;
          }
        },
      } as unknown as ReadableStreamDefaultController;

      const job = getJob(localId);
      if (job) job.subscribers.add(controller);

      return {
        async next(): Promise<IteratorResult<ActiveJob | null>> {
          if (done) return { value: undefined as never, done: true };

          if (!pending) {
            await new Promise<void>((r) => {
              resolve = r;
            });
          }
          pending = false;

          const current = getJob(localId);
          if (!current || current.status === "complete" || current.status === "error") {
            done = true;
            if (current) current.subscribers.delete(controller);
          }

          return { value: current ?? null, done: false };
        },

        async return(): Promise<IteratorResult<ActiveJob | null>> {
          done = true;
          const current = getJob(localId);
          if (current) current.subscribers.delete(controller);
          return { value: undefined as never, done: true };
        },
      };
    },
  };
}
