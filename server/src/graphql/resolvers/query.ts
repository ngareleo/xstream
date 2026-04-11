import { getJobById } from "../../db/queries/jobs.js";
import { getAllLibraries, getLibraryById } from "../../db/queries/libraries.js";
import { getVideoById } from "../../db/queries/videos.js";
import {
  type GQLLibrary,
  type GQLTranscodeJob,
  type GQLVideo,
  presentJob,
  presentLibrary,
  presentVideo,
} from "../presenters.js";
import { fromGlobalId } from "../relay.js";

export const queryResolvers = {
  Query: {
    node(
      _: unknown,
      { id }: { id: string }
    ): ((GQLLibrary | GQLVideo | GQLTranscodeJob) & { __typename: string }) | null {
      const { type, id: localId } = fromGlobalId(id);
      if (type === "Library") {
        const row = getLibraryById(localId);
        return row ? { __typename: "Library", ...presentLibrary(row) } : null;
      }
      if (type === "Video") {
        const row = getVideoById(localId);
        return row ? { __typename: "Video", ...presentVideo(row) } : null;
      }
      if (type === "TranscodeJob") {
        const row = getJobById(localId);
        return row ? { __typename: "TranscodeJob", ...presentJob(row) } : null;
      }
      return null;
    },

    libraries(): GQLLibrary[] {
      return getAllLibraries().map(presentLibrary);
    },

    video(_: unknown, { id }: { id: string }): GQLVideo | null {
      const { id: localId } = fromGlobalId(id);
      const row = getVideoById(localId);
      return row ? presentVideo(row) : null;
    },

    transcodeJob(_: unknown, { id }: { id: string }): GQLTranscodeJob | null {
      const { id: localId } = fromGlobalId(id);
      const row = getJobById(localId);
      return row ? presentJob(row) : null;
    },
  },
};
