import { getJob } from "../../services/jobStore.js";
import { type GQLTranscodeJob, presentJob } from "../presenters.js";
import { fromGlobalId } from "../relay.js";

export const subscriptionResolvers = {
  Subscription: {
    transcodeJobUpdated: {
      subscribe(
        _: unknown,
        { jobId }: { jobId: string }
      ): AsyncIterable<{ transcodeJobUpdated: GQLTranscodeJob | null }> {
        const { id: localId } = fromGlobalId(jobId);
        const job = getJob(localId);
        if (!job) throw new Error(`Job not found: ${jobId}`);

        return {
          [Symbol.asyncIterator]() {
            let resolve: (() => void) | undefined;
            let pending = false; // notification arrived before next() was awaiting
            let done = false;

            const controller = {
              enqueue(_: null) {
                if (resolve) {
                  // next() is already waiting — unblock it immediately
                  resolve();
                  resolve = undefined;
                } else {
                  // next() hasn't been called yet — buffer the signal
                  pending = true;
                }
              },
            } as unknown as ReadableStreamDefaultController;

            job.subscribers.add(controller);

            return {
              async next(): Promise<
                IteratorResult<{ transcodeJobUpdated: GQLTranscodeJob | null }>
              > {
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
                  job.subscribers.delete(controller);
                }

                return {
                  value: { transcodeJobUpdated: current ? presentJob(current) : null },
                  done: false,
                };
              },
              async return(): Promise<
                IteratorResult<{ transcodeJobUpdated: GQLTranscodeJob | null }>
              > {
                done = true;
                job.subscribers.delete(controller);
                return { value: undefined as never, done: true };
              },
            };
          },
        };
      },

      resolve(payload: { transcodeJobUpdated: GQLTranscodeJob | null }): GQLTranscodeJob | null {
        return payload.transcodeJobUpdated;
      },
    },
  },
};
