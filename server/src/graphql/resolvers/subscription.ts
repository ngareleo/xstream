import { subscribeToJob } from "../../services/jobStore.js";
import {
  getCurrentScanProgress,
  isScanRunning,
  subscribeToScan,
} from "../../services/scanStore.js";
import { type GQLTranscodeJob, presentJob } from "../presenters.js";
import { fromGlobalId, toGlobalId } from "../relay.js";

interface GQLLibraryScanUpdate {
  scanning: boolean;
}

interface GQLLibraryScanProgress {
  scanning: boolean;
  libraryId: string | null;
  done: number | null;
  total: number | null;
}

export const subscriptionResolvers = {
  Subscription: {
    transcodeJobUpdated: {
      async *subscribe(
        _: unknown,
        { jobId }: { jobId: string }
      ): AsyncGenerator<{ transcodeJobUpdated: GQLTranscodeJob | null }> {
        // Guard against empty or invalid global IDs (the client sends "" when
        // jobId is null — don't crash, just subscribe to nothing).
        if (!jobId) return;
        let localId: string;
        try {
          ({ id: localId } = fromGlobalId(jobId));
        } catch {
          return;
        }

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

        for await (const progress of subscribeToScan()) {
          yield { libraryScanUpdated: { scanning: progress.scanning } };
        }
      },

      resolve(payload: { libraryScanUpdated: GQLLibraryScanUpdate }): GQLLibraryScanUpdate {
        return payload.libraryScanUpdated;
      },
    },

    libraryScanProgress: {
      async *subscribe(): AsyncGenerator<{ libraryScanProgress: GQLLibraryScanProgress }> {
        // Emit current state immediately
        const current = getCurrentScanProgress();
        yield {
          libraryScanProgress: {
            scanning: current.scanning,
            libraryId: current.libraryId ? toGlobalId("Library", current.libraryId) : null,
            done: current.done,
            total: current.total,
          },
        };

        for await (const progress of subscribeToScan()) {
          yield {
            libraryScanProgress: {
              scanning: progress.scanning,
              libraryId: progress.libraryId ? toGlobalId("Library", progress.libraryId) : null,
              done: progress.done,
              total: progress.total,
            },
          };
        }
      },

      resolve(payload: { libraryScanProgress: GQLLibraryScanProgress }): GQLLibraryScanProgress {
        return payload.libraryScanProgress;
      },
    },
  },
};
