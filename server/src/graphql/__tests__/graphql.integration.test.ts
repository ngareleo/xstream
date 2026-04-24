/**
 * GraphQL API integration tests.
 *
 * These tests spin up the real yoga handler against the shared test SQLite
 * database (DB_PATH set by src/test/setup.ts preload) and verify end-to-end
 * behavior: DB → resolvers → GraphQL response.
 *
 * Use unique IDs (gql-lib1, gql-vid1, …) to avoid collisions with other test
 * files that share this database.
 *
 * Run with: bun test src/graphql/__tests__/graphql.integration.test.ts
 */
import { beforeAll, describe, expect, test } from "bun:test";

// These imports must come AFTER DB_PATH is set (handled by the preload)
const { yoga } = await import("../../routes/graphql.js");
const { getDb } = await import("../../db/index.js");
const { upsertLibrary } = await import("../../db/queries/libraries.js");
const { upsertVideo } = await import("../../db/queries/videos.js");
const { toGlobalId } = await import("../relay.js");

function gql(query: string, variables?: Record<string, unknown>): ReturnType<typeof yoga.fetch> {
  return yoga.fetch(
    new Request("http://localhost/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    })
  );
}

beforeAll(() => {
  // Opening the DB triggers migrations
  getDb();

  // Seed test data with unique IDs so this file doesn't collide with other test files
  upsertLibrary({
    id: "gql-lib1",
    name: "Test Library",
    path: "/tmp/gql-test-library",
    media_type: "movies",
    env: "dev",
    video_extensions: "[]",
  });

  upsertVideo({
    id: "gql-vid1",
    library_id: "gql-lib1",
    path: "/tmp/gql-test-library/movie.mp4",
    filename: "movie.mp4",
    title: "Test Movie",
    duration_seconds: 120,
    file_size_bytes: 1024,
    bitrate: 5000000,
    scanned_at: new Date().toISOString(),
    content_fingerprint: "1024:aabbccddeeff00112233445566778899aabbccdd",
  });
});

describe("GraphQL API", () => {
  test("introspection responds with the schema", async () => {
    const res = await gql("{ __schema { queryType { name } } }");
    const body = (await res.json()) as { data: { __schema: { queryType: { name: string } } } };
    expect(res.status).toBe(200);
    expect(body.data.__schema.queryType.name).toBe("Query");
  });

  test("libraries query includes seeded library", async () => {
    const res = await gql("{ libraries { id name } }");
    const body = (await res.json()) as { data: { libraries: { id: string; name: string }[] } };
    expect(res.status).toBe(200);
    const names = body.data.libraries.map((l) => l.name);
    expect(names).toContain("Test Library");
  });

  test("library id is a valid Relay global ID", async () => {
    const globalId = toGlobalId("Library", "gql-lib1");
    const res = await gql(`query ($id: ID!) { node(id: $id) { id ... on Library { name } } }`, {
      id: globalId,
    });
    const body = (await res.json()) as { data: { node: { id: string } } };
    const decoded = Buffer.from(body.data.node.id, "base64").toString("utf8");
    expect(decoded).toBe("Library:gql-lib1");
  });

  test("node query resolves a Library by global ID", async () => {
    const globalId = toGlobalId("Library", "gql-lib1");
    const res = await gql(`query ($id: ID!) { node(id: $id) { id ... on Library { name } } }`, {
      id: globalId,
    });
    const body = (await res.json()) as { data: { node: { id: string; name: string } } };
    expect(res.status).toBe(200);
    expect(body.data.node.name).toBe("Test Library");
  });

  test("video query returns a video by global ID", async () => {
    const globalId = toGlobalId("Video", "gql-vid1");
    const res = await gql(`query ($id: ID!) { video(id: $id) { id title durationSeconds } }`, {
      id: globalId,
    });
    const body = (await res.json()) as {
      data: { video: { id: string; title: string; durationSeconds: number } };
    };
    expect(res.status).toBe(200);
    expect(body.data.video.title).toBe("Test Movie");
    expect(body.data.video.durationSeconds).toBe(120);
  });

  test("unknown field returns a descriptive error in the response body", async () => {
    const res = await gql("{ nonexistentField }");
    const body = (await res.json()) as { errors: { message: string }[] };
    // graphql-yoga follows GraphQL-over-HTTP: errors are 200 with `errors` array
    expect(res.status).toBe(200);
    expect(body.errors).toBeDefined();
    expect(body.errors[0].message).toMatch(/nonexistentField/i);
  });

  test("startTranscode returns PlaybackError VIDEO_NOT_FOUND for unknown video", async () => {
    // Hit the resolver with a globalId that doesn't exist in the DB. The new
    // typed-error contract must return data.startTranscode as a PlaybackError
    // union member instead of throwing (which would surface as
    // "Unexpected error: No data returned" — the trace bf25cb77 failure mode).
    const fakeGlobalId = toGlobalId("Video", "does-not-exist");
    const res = await gql(
      `mutation ($videoId: ID!, $resolution: Resolution!) {
         startTranscode(videoId: $videoId, resolution: $resolution) {
           __typename
           ... on TranscodeJob { id }
           ... on PlaybackError { code message retryable retryAfterMs }
         }
       }`,
      { videoId: fakeGlobalId, resolution: "RESOLUTION_240P" }
    );
    const body = (await res.json()) as {
      data: {
        startTranscode: {
          __typename: string;
          code?: string;
          message?: string;
          retryable?: boolean;
          retryAfterMs?: number | null;
        };
      };
      errors?: unknown[];
    };
    expect(res.status).toBe(200);
    expect(body.errors).toBeUndefined();
    expect(body.data.startTranscode.__typename).toBe("PlaybackError");
    expect(body.data.startTranscode.code).toBe("VIDEO_NOT_FOUND");
    expect(body.data.startTranscode.retryable).toBe(false);
    expect(body.data.startTranscode.retryAfterMs).toBeNull();
  });
});
