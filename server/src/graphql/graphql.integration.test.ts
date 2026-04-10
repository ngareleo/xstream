/**
 * GraphQL API integration tests.
 *
 * These tests spin up the real yoga handler against a temp SQLite database
 * and verify end-to-end behavior: DB → resolvers → GraphQL response.
 *
 * Run with: bun test src/graphql/graphql.integration.test.ts
 * (DB_PATH is set in beforeAll to an isolated temp file)
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";

const TEST_DIR = `/tmp/tvke-test-${Date.now()}`;

// Must be set before any import that triggers getDb() / config
process.env.DB_PATH = join(TEST_DIR, "test.db");

// These imports must come AFTER the env var is set
const { yoga } = await import("../routes/graphql.js");
const { getDb } = await import("../db/index.js");
const { upsertLibrary } = await import("../db/queries/libraries.js");
const { upsertVideo } = await import("../db/queries/videos.js");
const { toGlobalId } = await import("./relay.js");

function gql(query: string, variables?: Record<string, unknown>) {
  return yoga.fetch(new Request("http://localhost/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  }));
}

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  // Opening the DB triggers migrations
  getDb();

  // Seed test data
  upsertLibrary({
    id: "lib1",
    name: "Test Library",
    path: "/tmp/test-library",
    media_type: "movies",
    env: "dev",
  });

  upsertVideo({
    id: "vid1",
    library_id: "lib1",
    path: "/tmp/test-library/movie.mp4",
    filename: "movie.mp4",
    title: "Test Movie",
    duration_seconds: 120,
    file_size_bytes: 1024,
    bitrate: 5000000,
    scanned_at: new Date().toISOString(),
  });
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("GraphQL API", () => {
  test("introspection responds with the schema", async () => {
    const res = await gql("{ __schema { queryType { name } } }");
    const body = await res.json() as { data: { __schema: { queryType: { name: string } } } };
    expect(res.status).toBe(200);
    expect(body.data.__schema.queryType.name).toBe("Query");
  });

  test("libraries query returns seeded library", async () => {
    const res = await gql("{ libraries { id name } }");
    const body = await res.json() as { data: { libraries: { id: string; name: string }[] } };
    expect(res.status).toBe(200);
    expect(body.data.libraries).toHaveLength(1);
    expect(body.data.libraries[0].name).toBe("Test Library");
  });

  test("library id is a valid Relay global ID", async () => {
    const res = await gql("{ libraries { id } }");
    const body = await res.json() as { data: { libraries: { id: string }[] } };
    const [lib] = body.data.libraries;
    const decoded = Buffer.from(lib.id, "base64").toString("utf8");
    expect(decoded).toBe("Library:lib1");
  });

  test("node query resolves a Library by global ID", async () => {
    const globalId = toGlobalId("Library", "lib1");
    const res = await gql(
      `query ($id: ID!) { node(id: $id) { id ... on Library { name } } }`,
      { id: globalId }
    );
    const body = await res.json() as { data: { node: { id: string; name: string } } };
    expect(res.status).toBe(200);
    expect(body.data.node.name).toBe("Test Library");
  });

  test("video query returns a video by global ID", async () => {
    const globalId = toGlobalId("Video", "vid1");
    const res = await gql(
      `query ($id: ID!) { video(id: $id) { id title durationSeconds } }`,
      { id: globalId }
    );
    const body = await res.json() as { data: { video: { id: string; title: string; durationSeconds: number } } };
    expect(res.status).toBe(200);
    expect(body.data.video.title).toBe("Test Movie");
    expect(body.data.video.durationSeconds).toBe(120);
  });

  test("unknown field returns a descriptive error in the response body", async () => {
    const res = await gql("{ nonexistentField }");
    const body = await res.json() as { errors: { message: string }[] };
    // graphql-yoga follows GraphQL-over-HTTP: errors are 200 with `errors` array
    expect(res.status).toBe(200);
    expect(body.errors).toBeDefined();
    expect(body.errors[0].message).toMatch(/nonexistentField/i);
  });
});
