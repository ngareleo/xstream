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
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

// These imports must come AFTER DB_PATH is set (handled by the preload)
const { yoga } = await import("../../routes/graphql.js");
const { getDb } = await import("../../db/index.js");
const { upsertLibrary } = await import("../../db/queries/libraries.js");
const { upsertVideo } = await import("../../db/queries/videos.js");
const { toGlobalId } = await import("../relay.js");
const { killAllJobs } = await import("../../services/ffmpegPool.js");
const { detectHwAccel } = await import("../../services/hwAccel.js");
const { getJob } = await import("../../services/jobStore.js");

const FIXTURES_DIR = resolve(import.meta.dir, "../../test/fixtures");
const GARBAGE_PATH = resolve(FIXTURES_DIR, "garbage.bin");

/** Poll the in-memory job store until the status transitions out of "running"/"pending"
 *  or the budget expires. Returns the job's terminal state for assertions. */
async function waitForJobTerminalStatus(
  predicate: () => string | undefined,
  budgetMs = 5000
): Promise<string | undefined> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const status = predicate();
    if (status === "complete" || status === "error") return status;
    await Bun.sleep(20);
  }
  return predicate();
}

function gql(query: string, variables?: Record<string, unknown>): ReturnType<typeof yoga.fetch> {
  return yoga.fetch(
    new Request("http://localhost/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    })
  );
}

beforeAll(async () => {
  // Opening the DB triggers migrations
  getDb();

  // Pre-flight detectHwAccel so background runFfmpeg calls don't throw on
  // getHwAccelConfig(). "off" mode is a no-op probe that caches
  // { kind: "software" } without touching the binary, so a sentinel path
  // is fine — keeps the test green on CI runners that don't ship
  // jellyfin-ffmpeg at the manifest's pinned location.
  await detectHwAccel("/dev/null/no-ffmpeg-needed-in-off-mode", "off");

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

  // Video row pointing at the 16-byte non-video fixture used to provoke
  // PROBE_FAILED — ffprobe parses it, finds no streams, fluent-ffmpeg throws,
  // chunker maps that to a typed PlaybackError (never a thrown GraphQL error).
  upsertVideo({
    id: "gql-vid-garbage",
    library_id: "gql-lib1",
    path: GARBAGE_PATH,
    filename: "garbage.bin",
    title: "Probe Fail Fixture",
    duration_seconds: 0,
    file_size_bytes: 16,
    bitrate: 0,
    scanned_at: new Date().toISOString(),
    content_fingerprint: "16:probefail-fixture",
  });
});

afterAll(async () => {
  // Defensive: the PROBE_FAILED path returns before spawning ffmpeg, but if a
  // future regression spawns and leaks one we want it killed before the suite
  // moves on.
  await killAllJobs();
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

  test("PROBE_FAILED surfaces on the in-memory job after the mutation returns", async () => {
    // startTranscodeJob returns a TranscodeJob (status: pending) synchronously
    // and runs ffmpeg/ffprobe in the background. PROBE_FAILED therefore
    // surfaces on the ActiveJob.errorCode after the probe completes — not
    // on the mutation response. The mutation must still NOT throw; the
    // INTERNAL fallback is reserved for unexpected exceptions only.
    //
    // Once the probe fails, the job's terminal state must be:
    //   status     = "error"
    //   errorCode  = "PROBE_FAILED"
    //   error      = a non-empty message
    //
    // The same data is what the transcodeJobUpdated subscription emits — see
    // subscription-error-atomicity.test.ts for the wire-level assertion.
    const globalId = toGlobalId("Video", "gql-vid-garbage");
    const res = await gql(
      `mutation ($videoId: ID!, $resolution: Resolution!) {
         startTranscode(videoId: $videoId, resolution: $resolution) {
           __typename
           ... on TranscodeJob { id status }
           ... on PlaybackError { code message retryable retryAfterMs }
         }
       }`,
      { videoId: globalId, resolution: "RESOLUTION_240P" }
    );
    const body = (await res.json()) as {
      data: {
        startTranscode: {
          __typename: string;
          id?: string;
          status?: string;
          code?: string;
        };
      };
      errors?: unknown[];
    };
    expect(res.status).toBe(200);
    expect(body.errors).toBeUndefined();
    // The mutation succeeded synchronously — typed-error contract holds even
    // for the async-probe-failure case (no thrown GraphQL error).
    expect(body.data.startTranscode.__typename).toBe("TranscodeJob");

    // Decode the TranscodeJob's global id back to the local job id so we can
    // observe the in-memory job state.
    const returnedGlobal = body.data.startTranscode.id;
    expect(typeof returnedGlobal).toBe("string");
    if (typeof returnedGlobal !== "string") return;
    const localJobId = Buffer.from(returnedGlobal, "base64").toString("utf8").split(":")[1];
    expect(typeof localJobId).toBe("string");
    if (typeof localJobId !== "string") return;

    const terminalStatus = await waitForJobTerminalStatus(() => getJob(localJobId)?.status);
    expect(terminalStatus).toBe("error");

    const finalJob = getJob(localJobId);
    expect(finalJob).toBeDefined();
    expect(finalJob?.errorCode).toBe("PROBE_FAILED");
    expect(typeof finalJob?.error).toBe("string");
    expect((finalJob?.error ?? "").length).toBeGreaterThan(0);
  });

  test("StartTranscodeResult union exposes both branches via __typename", async () => {
    // Schema-level smoke check: the union must list both members. If the
    // schema definition drifts (e.g. a member is renamed) introspection
    // catches it before the typed-error tests above can.
    const res = await gql(`{
      __type(name: "StartTranscodeResult") {
        kind
        possibleTypes { name }
      }
    }`);
    const body = (await res.json()) as {
      data: { __type: { kind: string; possibleTypes: { name: string }[] } };
    };
    expect(res.status).toBe(200);
    expect(body.data.__type.kind).toBe("UNION");
    const names = body.data.__type.possibleTypes.map((t) => t.name).sort();
    expect(names).toEqual(["PlaybackError", "TranscodeJob"]);
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
