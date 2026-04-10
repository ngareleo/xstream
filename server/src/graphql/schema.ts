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

  type Library implements Node {
    id: ID!
    name: String!
    path: String!
    mediaType: MediaType!
    # MAX_PAGE_SIZE = 100 (enforced server-side regardless of this default)
    videos(first: Int = 20, after: String): VideoConnection!
  }

  # ── Video ────────────────────────────────────────────────────────────────────

  type Video implements Node {
    id: ID!
    title: String!
    filename: String!
    durationSeconds: Float!
    fileSizeBytes: Float!
    bitrate: Int!
    library: Library!
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
  }

  # ── Root ─────────────────────────────────────────────────────────────────────

  type Query {
    node(id: ID!): Node
    libraries: [Library!]!
    video(id: ID!): Video
    transcodeJob(id: ID!): TranscodeJob
  }

  type Mutation {
    scanLibraries: [Library!]!
    startTranscode(
      videoId: ID!
      resolution: Resolution!
      startTimeSeconds: Float
      endTimeSeconds: Float
    ): TranscodeJob!
  }

  type Subscription {
    transcodeJobUpdated(jobId: ID!): TranscodeJob!
  }
`;
