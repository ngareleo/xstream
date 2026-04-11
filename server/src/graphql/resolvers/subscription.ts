import { subscribeToJob } from "../../services/jobStore.js";
import { isScanRunning, subscribeToScan } from "../../services/scanStore.js";
import { type GQLTranscodeJob, presentJob } from "../presenters.js";
import { fromGlobalId } from "../relay.js";

interface GQLLibraryScanUpdate {
  scanning: boolean;
}

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

    libraryScanUpdated: {
      async *subscribe(): AsyncGenerator<{ libraryScanUpdated: GQLLibraryScanUpdate }> {
        // Emit current state immediately so clients connecting mid-scan are informed
        yield { libraryScanUpdated: { scanning: isScanRunning() } };

        for await (const scanning of subscribeToScan()) {
          yield { libraryScanUpdated: { scanning } };
        }
      },

      resolve(payload: { libraryScanUpdated: GQLLibraryScanUpdate }): GQLLibraryScanUpdate {
        return payload.libraryScanUpdated;
      },
    },
  },
};
