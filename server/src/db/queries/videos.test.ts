/**
 * Integration tests for the videos DB query functions.
 * Uses a temp SQLite database to verify the actual SQL is correct.
 */
// DB_PATH is set by src/test/setup.ts (Bun preload) — do not override it here.
import { beforeAll, describe, expect, test } from "bun:test";

const {
  upsertVideo,
  replaceVideoStreams,
  getVideoById,
  getVideosByLibrary,
  countVideosByLibrary,
  getStreamsByVideoId,
} = await import("./videos.js");
const { getDb } = await import("../index.js"); // needed to seed FK parent rows

beforeAll(() => {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO libraries (id, name, path, media_type, env)
       VALUES ('libtest', 'Test Lib', '/test', 'movies', 'dev')`
    )
    .run();
});

const VIDEO: Parameters<typeof upsertVideo>[0] = {
  id: "vid1",
  library_id: "libtest",
  path: "/test/movie.mkv",
  filename: "movie.mkv",
  title: "Great Movie",
  duration_seconds: 7200,
  file_size_bytes: 4_000_000_000,
  bitrate: 4_000_000,
  scanned_at: "2026-01-01T00:00:00.000Z",
  content_fingerprint: "4000000000:aabbccddeeff00112233445566778899aabbccdd",
};

describe("upsertVideo", () => {
  test("inserts a new video row", () => {
    upsertVideo(VIDEO);
    const row = getVideoById("vid1");
    expect(row).not.toBeNull();
    if (!row) return;
    expect(row.title).toBe("Great Movie");
    expect(row.filename).toBe("movie.mkv");
    expect(row.duration_seconds).toBe(7200);
    expect(row.file_size_bytes).toBe(4_000_000_000);
  });

  test("ON CONFLICT(path) updates metadata fields", () => {
    upsertVideo({ ...VIDEO, title: "Updated Title", duration_seconds: 3600, bitrate: 8_000_000 });
    const row = getVideoById("vid1");
    expect(row).not.toBeNull();
    if (!row) return;
    expect(row.title).toBe("Updated Title");
    expect(row.duration_seconds).toBe(3600);
    expect(row.bitrate).toBe(8_000_000);
    // id and path must not change
    expect(row.id).toBe("vid1");
    expect(row.path).toBe("/test/movie.mkv");
  });

  test("null title is stored as null", () => {
    upsertVideo({ ...VIDEO, id: "vid-null-title", path: "/test/notitle.mkv", title: null });
    const row = getVideoById("vid-null-title");
    expect(row).not.toBeNull();
    if (!row) return;
    expect(row.title).toBeNull();
  });
});

describe("replaceVideoStreams", () => {
  beforeAll(() => {
    upsertVideo(VIDEO);
  });

  test("inserts video and audio stream rows", () => {
    replaceVideoStreams("vid1", [
      {
        video_id: "vid1",
        stream_type: "video",
        codec: "hevc",
        width: 3840,
        height: 2160,
        fps: 24,
        channels: null,
        sample_rate: null,
      },
      {
        video_id: "vid1",
        stream_type: "audio",
        codec: "aac",
        width: null,
        height: null,
        fps: null,
        channels: 2,
        sample_rate: 48000,
      },
    ]);
    const streams = getStreamsByVideoId("vid1");
    expect(streams.length).toBe(2);
    const video = streams.find((s) => s.stream_type === "video");
    const audio = streams.find((s) => s.stream_type === "audio");
    expect(video?.codec).toBe("hevc");
    expect(video?.width).toBe(3840);
    expect(audio?.codec).toBe("aac");
    expect(audio?.channels).toBe(2);
  });

  test("replaces existing streams wholesale on re-scan", () => {
    // Now update to a different codec — old rows must be gone
    replaceVideoStreams("vid1", [
      {
        video_id: "vid1",
        stream_type: "video",
        codec: "h264",
        width: 1920,
        height: 1080,
        fps: 30,
        channels: null,
        sample_rate: null,
      },
    ]);
    const streams = getStreamsByVideoId("vid1");
    expect(streams.length).toBe(1);
    expect(streams[0].codec).toBe("h264");
    expect(streams[0].height).toBe(1080);
  });

  test("stores empty stream list (no streams)", () => {
    replaceVideoStreams("vid1", []);
    const streams = getStreamsByVideoId("vid1");
    expect(streams.length).toBe(0);
  });
});

describe("getVideosByLibrary + countVideosByLibrary", () => {
  beforeAll(() => {
    // Seed multiple videos in libtest
    for (let i = 2; i <= 6; i++) {
      upsertVideo({
        ...VIDEO,
        id: `vid${i}`,
        path: `/test/movie${i}.mkv`,
        filename: `movie${i}.mkv`,
        title: `Movie ${i}`,
      });
    }
  });

  test("countVideosByLibrary returns total row count", () => {
    const count = countVideosByLibrary("libtest");
    expect(count).toBeGreaterThanOrEqual(6);
  });

  test("getVideosByLibrary returns at most limit rows", () => {
    const rows = getVideosByLibrary("libtest", 3, 0);
    expect(rows.length).toBe(3);
  });

  test("offset skips the first N rows", () => {
    const page1 = getVideosByLibrary("libtest", 3, 0);
    const page2 = getVideosByLibrary("libtest", 3, 3);
    const ids1 = page1.map((r) => r.id);
    const ids2 = page2.map((r) => r.id);
    // No overlap between pages
    for (const id of ids2) {
      expect(ids1).not.toContain(id);
    }
  });

  test("returns empty array for unknown library", () => {
    const rows = getVideosByLibrary("nonexistent-lib", 10, 0);
    expect(rows.length).toBe(0);
  });

  test("countVideosByLibrary returns 0 for unknown library", () => {
    expect(countVideosByLibrary("nonexistent-lib")).toBe(0);
  });
});

describe("getVideoById", () => {
  test("returns null for missing video", () => {
    expect(getVideoById("no-such-video")).toBeNull();
  });

  test("round-trips all fields correctly", () => {
    const full: Parameters<typeof upsertVideo>[0] = {
      id: "vid-full",
      library_id: "libtest",
      path: "/test/full.mkv",
      filename: "full.mkv",
      title: "Full Test",
      duration_seconds: 5400.5,
      file_size_bytes: 8_589_934_592,
      bitrate: 15_000_000,
      scanned_at: "2026-03-15T12:00:00.000Z",
      content_fingerprint: "8589934592:abc123def456",
    };
    upsertVideo(full);
    const row = getVideoById("vid-full");
    expect(row).not.toBeNull();
    if (!row) return;
    expect(row.duration_seconds).toBe(5400.5);
    expect(row.file_size_bytes).toBe(8_589_934_592);
    expect(row.bitrate).toBe(15_000_000);
    expect(row.scanned_at).toBe("2026-03-15T12:00:00.000Z");
  });
});
