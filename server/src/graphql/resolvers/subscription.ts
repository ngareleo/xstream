import { subscribeToJob } from "../../services/jobStore.js";
import { type GQLTranscodeJob, presentJob } from "../presenters.js";
import { fromGlobalId } from "../relay.js";

export const subscriptionResolvers = {
  Subscription: {
    transcodeJobUpdated: {
      async *subscribe(
        _: unknown,
        { jobId }: { jobId: string }
      ): AsyncGenerator<{ transcodeJobUpdated: GQLTranscodeJob | null }> {
        const { id: localId } = fromGlobalId(jobId);

        for await (const job of subscribeToJob(localId)) {
          yield { transcodeJobUpdated: job ? presentJob(job) : null };
        }
      },

      resolve(payload: { transcodeJobUpdated: GQLTranscodeJob | null }): GQLTranscodeJob | null {
        return payload.transcodeJobUpdated;
      },
    },
  },
};
