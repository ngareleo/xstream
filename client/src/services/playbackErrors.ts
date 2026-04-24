/**
 * Typed playback errors. Mirrors the server's `PlaybackErrorCode` enum 1:1
 * (see `server/src/graphql/schema.ts`). Used by the chunk-start mutation
 * handler in `useChunkedPlayback` to discriminate the `StartTranscodeResult`
 * union and by `PlaybackController.requestChunk` to drive retry policy.
 *
 * Why a class (not a plain object): retry decisions live in `requestChunk`
 * which catches Promise rejections — a class extending `Error` flows
 * naturally through `.catch()` and `instanceof` while still carrying the
 * full discriminated payload.
 */
export type PlaybackErrorCode =
  | "CAPACITY_EXHAUSTED"
  | "VIDEO_NOT_FOUND"
  | "PROBE_FAILED"
  | "ENCODE_FAILED"
  | "INTERNAL";

export class PlaybackError extends Error {
  public readonly code: PlaybackErrorCode;
  public readonly retryable: boolean;
  public readonly retryAfterMs: number | null;

  constructor(args: {
    code: PlaybackErrorCode;
    message: string;
    retryable: boolean;
    retryAfterMs: number | null;
  }) {
    super(args.message);
    this.name = "PlaybackError";
    this.code = args.code;
    this.retryable = args.retryable;
    this.retryAfterMs = args.retryAfterMs;
  }
}

export function isPlaybackError(err: unknown): err is PlaybackError {
  return err instanceof PlaybackError;
}
