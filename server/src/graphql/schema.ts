export const typeDefs = /* GraphQL */ `
  interface Node {
    id: ID!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  # ── Library ──────────────────────────────────────────────────────────────────

  enum MediaType {
    MOVIES
    TV_SHOWS
  }

  type LibraryStats {
    totalCount: Int!
    matchedCount: Int!
    unmatchedCount: Int!
    totalSizeBytes: Float!
  }

  type Library implements Node {
    id: ID!
    name: String!
    path: String!
    mediaType: MediaType!
    videoExtensions: [String!]!
    stats: LibraryStats!
    # MAX_PAGE_SIZE = 100 (enforced server-side regardless of this default)
    videos(first: Int = 20, after: String, search: String, mediaType: MediaType): VideoConnection!
  }

  # ── Video ────────────────────────────────────────────────────────────────────

  type VideoMetadata {
    imdbId: String!
    title: String!
    year: Int
    genre: String
    director: String
    cast: [String!]!
    rating: Float
    plot: String
    posterUrl: String
  }

  type Video implements Node {
    id: ID!
    title: String!
    filename: String!
    durationSeconds: Float!
    fileSizeBytes: Float!
    bitrate: Int!
    matched: Boolean!
    mediaType: MediaType!
    library: Library!
    metadata: VideoMetadata
    videoStream: VideoStreamInfo
    audioStream: AudioStreamInfo
  }

  type VideoStreamInfo {
    codec: String!
    width: Int!
    height: Int!
    fps: Float!
  }

  type AudioStreamInfo {
    codec: String!
    channels: Int!
    sampleRate: Int!
  }

  type VideoConnection {
    edges: [VideoEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type VideoEdge {
    node: Video!
    cursor: String!
  }

  # ── Watchlist ─────────────────────────────────────────────────────────────────

  type WatchlistItem implements Node {
    id: ID!
    video: Video!
    addedAt: String!
    progressSeconds: Float!
    notes: String
  }

  # ── OMDb search ───────────────────────────────────────────────────────────────

  type OmdbSearchResult {
    imdbId: String!
    title: String!
    year: Int
    posterUrl: String
    plot: String
  }

  # ── Transcode Job ─────────────────────────────────────────────────────────────

  enum Resolution {
    RESOLUTION_240P
    RESOLUTION_360P
    RESOLUTION_480P
    RESOLUTION_720P
    RESOLUTION_1080P
    RESOLUTION_4K
  }

  enum JobStatus {
    PENDING
    RUNNING
    COMPLETE
    ERROR
  }

  enum PlaybackErrorCode {
    """
    The server hit MAX_CONCURRENT_JOBS. Recoverable — retry after retryAfterMs.
    """
    CAPACITY_EXHAUSTED
    """
    The requested videoId does not exist in the DB. Non-retryable.
    """
    VIDEO_NOT_FOUND
    """
    ffprobe rejected the source file. Non-retryable for this resolution.
    """
    PROBE_FAILED
    """
    ffmpeg failed every fallback tier (HW → sw-pad → software). Non-retryable.
    """
    ENCODE_FAILED
    """
    Catch-all for unexpected server failures (DB write, mkdir, …). Non-retryable.
    """
    INTERNAL
  }

  """
  Typed failure for a chunk-start request. Returned by union from startTranscode
  and surfaced via TranscodeJob.errorCode for failures that happen mid-job
  (probe / encode) after the mutation already resolved successfully.
  """
  type PlaybackError {
    code: PlaybackErrorCode!
    message: String!
    """
    Whether the orchestration layer should retry the same call.
    """
    retryable: Boolean!
    """
    Server's hint for how long to wait before retrying. Null when retryable is false.
    """
    retryAfterMs: Int
  }

  union StartTranscodeResult = TranscodeJob | PlaybackError

  type TranscodeJob implements Node {
    id: ID!
    video: Video!
    resolution: Resolution!
    status: JobStatus!
    totalSegments: Int
    completedSegments: Int!
    startTimeSeconds: Float
    endTimeSeconds: Float
    createdAt: String!
    error: String
    """
    Typed code for mid-job failures (set when status == ERROR). Null otherwise.
    """
    errorCode: PlaybackErrorCode
  }

  # ── Playback history ──────────────────────────────────────────────────────────

  type PlaybackSession {
    id: ID!
    traceId: String!
    videoTitle: String!
    resolution: Resolution!
    startedAt: String!
  }

  # ── Root ─────────────────────────────────────────────────────────────────────

  type DirEntry {
    name: String!
    path: String!
  }

  type SettingEntry {
    key: String!
    value: String
  }

  type Query {
    node(id: ID!): Node
    libraries: [Library!]!
    videos(first: Int, libraryId: ID, search: String, mediaType: MediaType): VideoConnection!
    video(id: ID!): Video
    transcodeJob(id: ID!): TranscodeJob
    watchlist: [WatchlistItem!]!
    searchOmdb(query: String!, year: Int): [OmdbSearchResult!]!
    listDirectory(path: String!): [DirEntry!]!
    playbackHistory: [PlaybackSession!]!
    settings(keys: [String!]!): [SettingEntry!]!
  }

  type Mutation {
    scanLibraries: [Library!]!
    startTranscode(
      videoId: ID!
      resolution: Resolution!
      startTimeSeconds: Float
      endTimeSeconds: Float
    ): StartTranscodeResult!

    createLibrary(
      name: String!
      path: String!
      mediaType: MediaType!
      extensions: [String!]!
    ): Library!

    deleteLibrary(id: ID!): Boolean!

    updateLibrary(
      id: ID!
      name: String
      path: String
      mediaType: MediaType
      extensions: [String!]
    ): Library!

    matchVideo(videoId: ID!, imdbId: String!): Video!
    unmatchVideo(videoId: ID!): Video!

    addToWatchlist(videoId: ID!): WatchlistItem!
    removeFromWatchlist(id: ID!): Boolean!
    updateWatchProgress(videoId: ID!, progressSeconds: Float!): WatchlistItem!

    setSetting(key: String!, value: String!): Boolean!

    recordPlaybackSession(traceId: String!, videoId: ID!, resolution: Resolution!): PlaybackSession!
  }

  # ── Scan status ──────────────────────────────────────────────────────────────

  type LibraryScanUpdate {
    scanning: Boolean!
  }

  type LibraryScanProgress {
    scanning: Boolean!
    libraryId: ID
    done: Int
    total: Int
  }

  type Subscription {
    transcodeJobUpdated(jobId: ID!): TranscodeJob!
    """
    Emits immediately with the current scan state, then on every state change.
    scanning=true  → a scan is in progress
    scanning=false → scan completed; re-query libraries for updated data
    """
    libraryScanUpdated: LibraryScanUpdate!
    """
    Emits per-library scan progress including done/total counts for metadata matching.
    """
    libraryScanProgress: LibraryScanProgress!
  }
`;
