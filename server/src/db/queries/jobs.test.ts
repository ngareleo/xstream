/**
 * Integration tests for the transcode_jobs DB query functions.
 * Uses a temp SQLite database to verify the actual SQL is correct.
 */
// DB_PATH is set by src/test/setup.ts (Bun preload) — do not override it here.
import { beforeAll, describe, expect, test } from "bun:test";

const { insertJob, updateJobStatus, getJobById, getInterruptedJobs } = await import("./jobs.js");
const { getDb } = await import("../index.js");

beforeAll(() => {
  // Seed parent rows required by foreign key constraints
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO libraries (id, name, path, media_type, env)
    VALUES ('libtest', 'Test Lib', '/test', 'movies', 'dev')`
  ).run();
  db.prepare(
    `INSERT OR IGNORE INTO videos
    (id, library_id, path, filename, title, duration_seconds, file_size_bytes, bitrate, scanned_at, content_fingerprint)
    VALUES ('vvvv', 'libtest', '/test/v.mp4', 'v.mp4', 'Test Video', 3600, 1000000, 5000000, '2026-01-01T00:00:00.000Z', '1000000:aabbccddeeff00112233445566778899aabbccdd')`
  ).run();
});

const JOB: Parameters<typeof insertJob>[0] = {
  id: "aaaa",
  video_id: "vvvv",
  resolution: "1080p",
  status: "pending",
  segment_dir: "/tmp/aaaa",
  total_segments: null,
  completed_segments: 0,
  start_time_seconds: null,
  end_time_seconds: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  error: null,
};

describe("insertJob", () => {
  test("inserts a new job row", () => {
    insertJob(JOB);
    const row = getJobById("aaaa");
    expect(row).not.toBeNull();
    if (row == null) return;
    expect(row.status).toBe("pending");
    expect(row.resolution).toBe("1080p");
    expect(row.completed_segments).toBe(0);
  });

  test("INSERT OR REPLACE upserts an existing row", () => {
    insertJob({ ...JOB, status: "running" });
    const row = getJobById("aaaa");
    if (row == null) return;
    expect(row.status).toBe("running");
  });
});

describe("updateJobStatus", () => {
  beforeAll(() => {
    // Reset to known state
    insertJob({ ...JOB, id: "bbbb", status: "running" });
  });

  test("updates status to complete with counts", () => {
    updateJobStatus("bbbb", "complete", { total_segments: 100, completed_segments: 100 });
    const row = getJobById("bbbb");
    if (row == null) return;
    expect(row.status).toBe("complete");
    expect(row.total_segments).toBe(100);
    expect(row.completed_segments).toBe(100);
  });

  test("updates status to error with message", () => {
    insertJob({ ...JOB, id: "cccc", status: "running" });
    updateJobStatus("cccc", "error", { error: "transcode failed" });
    const row = getJobById("cccc");
    if (row == null) return;
    expect(row.status).toBe("error");
    expect(row.error).toBe("transcode failed");
  });

  test("COALESCE preserves existing counts when not provided", () => {
    insertJob({ ...JOB, id: "dddd", status: "running", completed_segments: 5 });
    updateJobStatus("dddd", "running"); // no counts provided
    const row = getJobById("dddd");
    if (row == null) return;
    expect(row.completed_segments).toBe(5); // must be preserved
  });

  test("updated_at is bumped on every update", async () => {
    insertJob({ ...JOB, id: "eeee", status: "running" });
    const before = getJobById("eeee")?.updated_at;
    await Bun.sleep(10);
    updateJobStatus("eeee", "running", { completed_segments: 1 });
    const after = getJobById("eeee")?.updated_at;
    expect(after != null && before != null && after > before).toBe(true);
  });
});

describe("getInterruptedJobs", () => {
  test("returns only jobs with status = running", () => {
    insertJob({ ...JOB, id: "rr1", status: "running" });
    insertJob({ ...JOB, id: "rr2", status: "running" });
    insertJob({ ...JOB, id: "rr3", status: "complete" });
    insertJob({ ...JOB, id: "rr4", status: "pending" });

    const interrupted = getInterruptedJobs();
    const ids = interrupted.map((j) => j.id);
    expect(ids).toContain("rr1");
    expect(ids).toContain("rr2");
    expect(ids).not.toContain("rr3");
    expect(ids).not.toContain("rr4");
  });
});

describe("getJobById", () => {
  test("returns null for missing job", () => {
    expect(getJobById("no-such-job")).toBeNull();
  });

  test("round-trips all fields correctly", () => {
    const full: Parameters<typeof insertJob>[0] = {
      id: "full1",
      video_id: "vvvv",
      resolution: "4k",
      status: "complete",
      segment_dir: "/tmp/full1",
      total_segments: 42,
      completed_segments: 42,
      start_time_seconds: 10.5,
      end_time_seconds: 20.0,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      error: null,
    };
    insertJob(full);
    const row = getJobById("full1");
    if (row == null) return;
    expect(row.total_segments).toBe(42);
    expect(row.start_time_seconds).toBe(10.5);
    expect(row.end_time_seconds).toBe(20.0);
    expect(row.resolution).toBe("4k");
  });
});
