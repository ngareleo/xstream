import { getJobById } from "../../db/queries/jobs.js";
import { getAllLibraries, getLibraryById } from "../../db/queries/libraries.js";
import { getVideoById } from "../../db/queries/videos.js";
import { getWatchlist, getWatchlistItemById } from "../../db/queries/watchlist.js";
import { isOmdbConfigured, searchOmdbList } from "../../services/omdbService.js";
import {
  type GQLLibrary,
  type GQLTranscodeJob,
  type GQLVideo,
  type GQLWatchlistItem,
  presentJob,
  presentLibrary,
  presentVideo,
  presentWatchlistItem,
} from "../presenters.js";
import { fromGlobalId } from "../relay.js";

export const queryResolvers = {
  Query: {
    node(
      _: unknown,
      { id }: { id: string }
    ):
      | ((GQLLibrary | GQLVideo | GQLTranscodeJob | GQLWatchlistItem) & { __typename: string })
      | null {
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
      if (type === "WatchlistItem") {
        const row = getWatchlistItemById(localId);
        return row ? { __typename: "WatchlistItem", ...presentWatchlistItem(row) } : null;
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

    watchlist(): GQLWatchlistItem[] {
      return getWatchlist().map(presentWatchlistItem);
    },

    async searchOmdb(
      _: unknown,
      { query, year }: { query: string; year?: number }
    ): Promise<
      {
        imdbId: string;
        title: string;
        year: number | null;
        posterUrl: string | null;
        plot: string | null;
      }[]
    > {
      const results = await searchOmdbList(query, year);
      return results.map((r) => ({
        imdbId: r.imdbId,
        title: r.title,
        year: r.year,
        posterUrl: r.posterUrl,
        plot: r.plot,
      }));
    },

    omdbConfigured(): boolean {
      return isOmdbConfigured();
    },
  },

  // WatchlistItem sub-resolvers
  WatchlistItem: {
    video(parent: GQLWatchlistItem): GQLVideo | null {
      const row = getVideoById(parent._raw.video_id);
      return row ? presentVideo(row) : null;
    },
  },
};
