import { readdir } from "fs/promises";
import { join } from "path";

import { getJobById } from "../../db/queries/jobs.js";
import { getAllLibraries, getLibraryById } from "../../db/queries/libraries.js";
import { getPlaybackHistory } from "../../db/queries/playbackHistory.js";
import { getSetting } from "../../db/queries/userSettings.js";
import { getVideoById, getVideos } from "../../db/queries/videos.js";
import { getWatchlist, getWatchlistItemById } from "../../db/queries/watchlist.js";
import { searchOmdbList } from "../../services/omdbService.js";
import { gqlMediaTypeToInternal } from "../mappers.js";
import {
  type GQLLibrary,
  type GQLPlaybackSession,
  type GQLTranscodeJob,
  type GQLVideo,
  type GQLWatchlistItem,
  presentJob,
  presentLibrary,
  presentPlaybackSession,
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

    videos(
      _: unknown,
      {
        first = 200,
        libraryId,
        search,
        mediaType,
      }: { first?: number; libraryId?: string; search?: string; mediaType?: string }
    ): { edges: { node: GQLVideo }[] } {
      const localLibraryId = libraryId ? fromGlobalId(libraryId).id : undefined;
      const internalMediaType = mediaType ? gqlMediaTypeToInternal(mediaType) : undefined;
      const rows = getVideos(first, {
        libraryId: localLibraryId,
        search,
        mediaType: internalMediaType,
      });
      return { edges: rows.map((row) => ({ node: presentVideo(row) })) };
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

    async listDirectory(
      _: unknown,
      { path: dirPath }: { path: string }
    ): Promise<{ name: string; path: string }[]> {
      try {
        const entries = await readdir(dirPath, { withFileTypes: true });
        return entries
          .filter((e) => e.isDirectory() && !e.name.startsWith("."))
          .map((e) => ({ name: e.name, path: join(dirPath, e.name) }))
          .sort((a, b) => a.name.localeCompare(b.name));
      } catch {
        return [];
      }
    },

    playbackHistory(): GQLPlaybackSession[] {
      return getPlaybackHistory().map(presentPlaybackSession);
    },

    settings(_: unknown, { keys }: { keys: string[] }): { key: string; value: string | null }[] {
      return keys.map((key) => ({ key, value: getSetting(key) }));
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
