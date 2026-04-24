/**
 * Integration tests for the segments DB query functions.
 * Uses a temp SQLite database to verify the actual SQL is correct.
 */
// DB_PATH is set by src/test/setup.ts (Bun preload) — do not override it here.
import { beforeAll, describe, expect, test } from "bun:test";

const { insertSegment, getSegmentsByJob, getSegment } = await import("./segments.js");
const { getDb } = await import("../index.js"); // needed to seed FK parent rows

beforeAll(() => {
  // Seed required parent rows
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO libraries (id, name, path, media_type, env)
     VALUES ('libtest', 'Test Lib', '/test', 'movies', 'dev')`
  ).run();
  db.prepare(
    `INSERT OR IGNORE INTO videos
     (id, library_id, path, filename, title, duration_seconds, file_size_bytes, bitrate, scanned_at)
     VALUES ('vvvv', 'libtest', '/test/v.mp4', 'v.mp4', 'Test Video', 3600, 1000000, 5000000, '2026-01-01T00:00:00.000Z')`
  ).run();
  db.prepare(
    `INSERT OR IGNORE INTO transcode_jobs
     (id, video_id, resolution, status, segment_dir, completed_segments, created_at, updated_at)
     VALUES ('job1', 'vvvv', '1080p', 'running', '/tmp/job1', 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
  ).run();
  // Clear any segments left over from a previous test run so count assertions are reliable
  db.prepare("DELETE FROM segments WHERE job_id = 'job1'").run();
});

const SEG: Parameters<typeof insertSegment>[0] = {
  job_id: "job1",
  segment_index: 0,
  path: "/tmp/job1/segment_0000.m4s",
  duration_seconds: 2.0,
  size_bytes: 512_000,
};

describe("insertSegment", () => {
  test("inserts a new segment row", () => {
    insertSegment(SEG);
    const row = getSegment("job1", 0);
    expect(row).not.toBeNull();
    expect(row!.path).toBe("/tmp/job1/segment_0000.m4s");
    expect(row!.segment_index).toBe(0);
    expect(row!.size_bytes).toBe(512_000);
  });

  test("INSERT OR IGNORE: duplicate (job_id, segment_index) is silently ignored", () => {
    // Insert duplicate — must not throw and must not overwrite
    insertSegment({ ...SEG, path: "/tmp/job1/DIFFERENT_PATH.m4s", size_bytes: 999 });
    const row = getSegment("job1", 0);
    // Original row remains unchanged
    expect(row!.path).toBe("/tmp/job1/segment_0000.m4s");
    expect(row!.size_bytes).toBe(512_000);
  });

  test("inserts multiple segments with different indices", () => {
    insertSegment({ ...SEG, segment_index: 1, path: "/tmp/job1/segment_0001.m4s" });
    insertSegment({ ...SEG, segment_index: 2, path: "/tmp/job1/segment_0002.m4s" });
    const rows = getSegmentsByJob("job1");
    expect(rows.length).toBe(3); // 0, 1, 2
  });

  test("stores null duration_seconds when not yet known", () => {
    insertSegment({
      ...SEG,
      segment_index: 3,
      path: "/tmp/job1/segment_0003.m4s",
      duration_seconds: null,
    });
    const row = getSegment("job1", 3);
    expect(row!.duration_seconds).toBeNull();
  });
});

describe("getSegmentsByJob", () => {
  test("returns segments ordered by segment_index ascending", () => {
    const rows = getSegmentsByJob("job1");
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].segment_index).toBeGreaterThan(rows[i - 1].segment_index);
    }
  });

  test("returns empty array for unknown job", () => {
    const rows = getSegmentsByJob("no-such-job");
    expect(rows.length).toBe(0);
  });

  test("each row has required fields", () => {
    const rows = getSegmentsByJob("job1");
    for (const row of rows) {
      expect(typeof row.id).toBe("number");
      expect(typeof row.job_id).toBe("string");
      expect(typeof row.segment_index).toBe("number");
      expect(typeof row.path).toBe("string");
    }
  });
});

describe("getSegment", () => {
  test("returns null for missing segment", () => {
    expect(getSegment("job1", 999)).toBeNull();
  });

  test("returns null for unknown job", () => {
    expect(getSegment("no-such-job", 0)).toBeNull();
  });

  test("returns the correct segment by job + index", () => {
    const row = getSegment("job1", 1);
    expect(row).not.toBeNull();
    expect(row!.job_id).toBe("job1");
    expect(row!.segment_index).toBe(1);
    expect(row!.path).toBe("/tmp/job1/segment_0001.m4s");
  });
});
