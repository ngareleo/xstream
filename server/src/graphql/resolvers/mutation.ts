import { createLibrary, deleteLibrary, updateLibrary } from "../../db/queries/libraries.js";
import { setSetting } from "../../db/queries/userSettings.js";
import { deleteVideoMetadata, upsertVideoMetadata } from "../../db/queries/videoMetadata.js";
import { getVideoById } from "../../db/queries/videos.js";
import {
  addWatchlistItem,
  removeWatchlistItem,
  updateWatchlistProgress,
} from "../../db/queries/watchlist.js";
import { startTranscodeJob } from "../../services/chunker.js";
import { scanLibraries } from "../../services/libraryScanner.js";
import { fetchOmdbById, isOmdbConfigured } from "../../services/omdbService.js";
import type { MediaType, VideoMetadataRow } from "../../types.js";
import { gqlMediaTypeToInternal, gqlResolutionToInternal } from "../mappers.js";
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

export const mutationResolvers = {
  Mutation: {
    async scanLibraries(): Promise<GQLLibrary[]> {
      const rows = await scanLibraries();
      return rows.map(presentLibrary);
    },

    async startTranscode(
      _: unknown,
      {
        videoId,
        resolution,
        startTimeSeconds,
        endTimeSeconds,
      }: {
        videoId: string;
        resolution: string;
        startTimeSeconds?: number;
        endTimeSeconds?: number;
      }
    ): Promise<GQLTranscodeJob> {
      const { id: localVideoId } = fromGlobalId(videoId);
      const internalResolution = gqlResolutionToInternal(resolution);

      const job = await startTranscodeJob(
        localVideoId,
        internalResolution,
        startTimeSeconds,
        endTimeSeconds
      );

      return presentJob(job);
    },

    async createLibrary(
      _: unknown,
      {
        name,
        path,
        mediaType,
        extensions,
      }: { name: string; path: string; mediaType: string; extensions: string[] }
    ): Promise<GQLLibrary> {
      const internalType = gqlMediaTypeToInternal(mediaType) as MediaType;
      // createLibrary is a synchronous SQLite INSERT — fast for a local dev store.
      const row = createLibrary(name, path, internalType, extensions);
      // Fire-and-forget background scan so the mutation resolves without waiting.
      void scanLibraries();
      return presentLibrary(row);
    },

    deleteLibrary(_: unknown, { id }: { id: string }): boolean {
      const { id: localId } = fromGlobalId(id);
      return deleteLibrary(localId);
    },

    updateLibrary(
      _: unknown,
      {
        id,
        name,
        path,
        mediaType,
        extensions,
      }: { id: string; name?: string; path?: string; mediaType?: string; extensions?: string[] }
    ): GQLLibrary {
      const { id: localId } = fromGlobalId(id);
      const updated = updateLibrary(localId, {
        name,
        path,
        mediaType: mediaType ? gqlMediaTypeToInternal(mediaType) : undefined,
        extensions,
      });
      if (!updated) throw new Error("Library not found");
      return presentLibrary(updated);
    },

    async matchVideo(
      _: unknown,
      { videoId, imdbId }: { videoId: string; imdbId: string }
    ): Promise<GQLVideo> {
      if (!isOmdbConfigured()) {
        throw new Error("OMDB_API_KEY not configured — go to Settings → Metadata to add it");
      }
      const { id: localVideoId } = fromGlobalId(videoId);
      const video = getVideoById(localVideoId);
      if (!video) throw new Error(`Video not found: ${videoId}`);

      const result = await fetchOmdbById(imdbId);
      if (!result) throw new Error(`OMDb returned no result for IMDb ID: ${imdbId}`);

      const metadata: VideoMetadataRow = {
        video_id: localVideoId,
        imdb_id: result.imdbId,
        title: result.title,
        year: result.year,
        genre: result.genre,
        director: result.director,
        cast_list: result.actors.length > 0 ? JSON.stringify(result.actors) : null,
        rating: result.imdbRating,
        plot: result.plot,
        poster_url: result.posterUrl,
        matched_at: new Date().toISOString(),
      };
      upsertVideoMetadata(metadata);

      return presentVideo(video, true);
    },

    unmatchVideo(_: unknown, { videoId }: { videoId: string }): GQLVideo {
      const { id: localVideoId } = fromGlobalId(videoId);
      const video = getVideoById(localVideoId);
      if (!video) throw new Error(`Video not found: ${videoId}`);
      deleteVideoMetadata(localVideoId);
      return presentVideo(video, false);
    },

    addToWatchlist(_: unknown, { videoId }: { videoId: string }): GQLWatchlistItem {
      const { id: localVideoId } = fromGlobalId(videoId);
      const row = addWatchlistItem(localVideoId);
      return presentWatchlistItem(row);
    },

    removeFromWatchlist(_: unknown, { id }: { id: string }): boolean {
      const { id: localId } = fromGlobalId(id);
      return removeWatchlistItem(localId);
    },

    updateWatchProgress(
      _: unknown,
      { videoId, progressSeconds }: { videoId: string; progressSeconds: number }
    ): GQLWatchlistItem {
      const { id: localVideoId } = fromGlobalId(videoId);
      const row = updateWatchlistProgress(localVideoId, progressSeconds);
      if (!row) throw new Error(`No watchlist item found for video: ${videoId}`);
      return presentWatchlistItem(row);
    },

    setSetting(_: unknown, { key, value }: { key: string; value: string }): boolean {
      setSetting(key, value);
      return true;
    },
  },
};
