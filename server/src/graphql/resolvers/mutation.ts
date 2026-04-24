import { randomUUID } from "crypto";

import { createLibrary, deleteLibrary, updateLibrary } from "../../db/queries/libraries.js";
import { insertPlaybackSession } from "../../db/queries/playbackHistory.js";
import { setSetting } from "../../db/queries/userSettings.js";
import { deleteVideoMetadata, upsertVideoMetadata } from "../../db/queries/videoMetadata.js";
import { getVideoById } from "../../db/queries/videos.js";
import {
  addWatchlistItem,
  removeWatchlistItem,
  updateWatchlistProgress,
} from "../../db/queries/watchlist.js";
import type { GQLContext } from "../../routes/graphql.js";
import { startTranscodeJob } from "../../services/chunker.js";
import { scanLibraries } from "../../services/libraryScanner.js";
import { fetchOmdbById, isOmdbConfigured } from "../../services/omdbService.js";
import type { MediaType, VideoMetadataRow } from "../../types.js";
import { gqlMediaTypeToInternal, gqlResolutionToInternal } from "../mappers.js";
import {
  type GQLLibrary,
  type GQLPlaybackError,
  type GQLPlaybackSession,
  type GQLTranscodeJob,
  type GQLVideo,
  type GQLWatchlistItem,
  presentJob,
  presentLibrary,
  presentPlaybackError,
  presentPlaybackSession,
  presentVideo,
  presentWatchlistItem,
} from "../presenters.js";
import { fromGlobalId } from "../relay.js";

export const mutationResolvers = {
  /**
   * Discriminates union members by the `__typename` set on the presenter
   * output. Required by graphql-tools because the union has no `interface`
   * field that yoga could auto-resolve from. Lives at the top level (not
   * inside `Mutation`) because `StartTranscodeResult` is a type, not a
   * Mutation field.
   */
  StartTranscodeResult: {
    __resolveType(obj: GQLTranscodeJob | GQLPlaybackError): string {
      return obj.__typename;
    },
  },

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
      },
      ctx: GQLContext
    ): Promise<GQLTranscodeJob | GQLPlaybackError> {
      const { id: localVideoId } = fromGlobalId(videoId);
      const internalResolution = gqlResolutionToInternal(resolution);

      // Defensive try/catch — startTranscodeJob now returns its own typed
      // errors for known cases. Anything that still throws is genuinely
      // unexpected (DB connection failure, etc.) and gets mapped to INTERNAL
      // so the client never sees an untyped GraphQL `errors[]` for the
      // playback path. Without this wrapper a single unexpected throw still
      // becomes Relay's "No data returned" protocol violation.
      try {
        const result = await startTranscodeJob(
          localVideoId,
          internalResolution,
          startTimeSeconds,
          endTimeSeconds,
          ctx.otelCtx
        );
        return result.kind === "ok"
          ? presentJob(result.job)
          : presentPlaybackError({
              code: result.code,
              message: result.message,
              retryable: result.retryable,
              retryAfterMs: result.retryAfterMs,
            });
      } catch (err) {
        return presentPlaybackError({
          code: "INTERNAL",
          message: (err as Error).message,
          retryable: false,
        });
      }
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

    recordPlaybackSession(
      _: unknown,
      { traceId, videoId, resolution }: { traceId: string; videoId: string; resolution: string }
    ): GQLPlaybackSession {
      const { id: localVideoId } = fromGlobalId(videoId);
      const video = getVideoById(localVideoId);
      const row = {
        id: randomUUID(),
        trace_id: traceId,
        video_id: localVideoId,
        video_title: video ? (video.title ?? video.filename) : "Unknown",
        resolution: gqlResolutionToInternal(resolution),
        started_at: new Date().toISOString(),
      };
      insertPlaybackSession(row);
      return presentPlaybackSession(row);
    },
  },
};
