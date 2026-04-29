/**
 * Cascade-delete contract.
 *
 * Schema (see migrate.ts):
 *   libraries → videos             ON DELETE CASCADE
 *   videos    → video_streams      ON DELETE CASCADE
 *   videos    → transcode_jobs     ON DELETE CASCADE
 *   videos    → video_metadata     ON DELETE CASCADE
 *   videos    → watchlist_items    ON DELETE CASCADE
 *   transcode_jobs → segments      ON DELETE CASCADE
 *
 *   playback_history has NO FK — rows survive video deletion by design,
 *   because session telemetry must outlive media that's been removed
 *   from the library.
 *
 * If `PRAGMA foreign_keys` ever flips back to OFF (it shouldn't — see
 * `pragmas.test.ts`) this test breaks loud, before the player UI starts
 * showing ghost rows.
 */
import { describe, expect, it } from "bun:test";

import { getDb } from "../../index.js";
import { insertJob } from "../jobs.js";
import { deleteLibrary } from "../libraries.js";
import { upsertLibrary } from "../libraries.js";
import { insertSegment } from "../segments.js";
import { upsertVideoMetadata } from "../videoMetadata.js";
import { replaceVideoStreams, upsertVideo } from "../videos.js";
import { addWatchlistItem } from "../watchlist.js";

describe("cascade deletes", () => {
  const db = getDb();

  function seedFullChain(suffix: string): {
    libraryId: string;
    videoId: string;
    jobId: string;
    historyId: string;
  } {
    const libraryId = `cascade-lib-${suffix}`;
    const videoId = `cascade-video-${suffix}`;
    const jobId = `cascade-job-${suffix}`;
    const historyId = `cascade-history-${suffix}`;
    const now = new Date().toISOString();

    upsertLibrary({
      id: libraryId,
      name: `Cascade Lib ${suffix}`,
      path: `/tmp/cascade-${suffix}`,
      media_type: "movies",
      env: "dev",
      video_extensions: "[]",
    });
    upsertVideo({
      id: videoId,
      library_id: libraryId,
      path: `/tmp/cascade-${suffix}/file.mkv`,
      filename: "file.mkv",
      title: "Cascade Test",
      duration_seconds: 100,
      file_size_bytes: 1000,
      bitrate: 1000,
      scanned_at: now,
      content_fingerprint: `cascade-fp-${suffix}`,
    });
    replaceVideoStreams(videoId, [
      {
        video_id: videoId,
        stream_type: "video",
        codec: "h264",
        width: 1920,
        height: 1080,
        fps: 24,
        channels: null,
        sample_rate: null,
      },
      {
        video_id: videoId,
        stream_type: "audio",
        codec: "aac",
        width: null,
        height: null,
        fps: null,
        channels: 2,
        sample_rate: 48000,
      },
    ]);
    insertJob({
      id: jobId,
      video_id: videoId,
      resolution: "1080p",
      status: "complete",
      segment_dir: `/tmp/cascade-segments/${jobId}`,
      total_segments: 3,
      completed_segments: 3,
      start_time_seconds: 0,
      end_time_seconds: 30,
      created_at: now,
      updated_at: now,
      error: null,
    });
    for (let i = 0; i < 3; i++) {
      insertSegment({
        job_id: jobId,
        segment_index: i,
        path: `/tmp/cascade-segments/${jobId}/segment_${String(i).padStart(4, "0")}.m4s`,
        duration_seconds: 10,
        size_bytes: 100,
      });
    }
    upsertVideoMetadata({
      video_id: videoId,
      imdb_id: `tt-cascade-${suffix}`,
      title: "Cascade Test",
      year: 2020,
      genre: null,
      director: null,
      cast_list: null,
      rating: null,
      plot: null,
      poster_url: null,
      matched_at: now,
    });
    addWatchlistItem(videoId);

    db.run(
      "INSERT INTO playback_history (id, trace_id, video_id, video_title, resolution, started_at) VALUES (?, ?, ?, ?, ?, ?)",
      [historyId, `trace-cascade-${suffix}`, videoId, "Cascade Test", "1080p", now]
    );

    return { libraryId, videoId, jobId, historyId };
  }

  function countWhere(table: string, idCol: string, idVal: string): number {
    const row = db.query(`SELECT COUNT(*) as c FROM ${table} WHERE ${idCol} = ?`).get(idVal) as {
      c: number;
    };
    return row.c;
  }

  it("library delete cascades through video → streams/job/segments/metadata/watchlist", () => {
    const { libraryId, videoId, jobId, historyId } = seedFullChain("library");

    // Confirm the chain is fully seeded before deletion.
    expect(countWhere("videos", "id", videoId)).toBe(1);
    expect(countWhere("video_streams", "video_id", videoId)).toBe(2);
    expect(countWhere("transcode_jobs", "id", jobId)).toBe(1);
    expect(countWhere("segments", "job_id", jobId)).toBe(3);
    expect(countWhere("video_metadata", "video_id", videoId)).toBe(1);
    expect(countWhere("watchlist_items", "video_id", videoId)).toBe(1);
    expect(countWhere("playback_history", "id", historyId)).toBe(1);

    const removed = deleteLibrary(libraryId);
    expect(removed).toBe(true);

    expect(countWhere("libraries", "id", libraryId)).toBe(0);
    expect(countWhere("videos", "id", videoId)).toBe(0);
    expect(countWhere("video_streams", "video_id", videoId)).toBe(0);
    expect(countWhere("transcode_jobs", "id", jobId)).toBe(0);
    expect(countWhere("segments", "job_id", jobId)).toBe(0);
    expect(countWhere("video_metadata", "video_id", videoId)).toBe(0);
    expect(countWhere("watchlist_items", "video_id", videoId)).toBe(0);

    // playback_history is intentionally NOT linked by FK.
    expect(countWhere("playback_history", "id", historyId)).toBe(1);

    // Best-effort cleanup so the row doesn't accumulate across worker runs.
    db.run("DELETE FROM playback_history WHERE id = ?", [historyId]);
  });

  it("video delete cascades to streams/jobs/segments/metadata/watchlist (without removing the library)", () => {
    const { libraryId, videoId, jobId, historyId } = seedFullChain("video");

    db.run("DELETE FROM videos WHERE id = ?", [videoId]);

    expect(countWhere("libraries", "id", libraryId)).toBe(1);
    expect(countWhere("videos", "id", videoId)).toBe(0);
    expect(countWhere("video_streams", "video_id", videoId)).toBe(0);
    expect(countWhere("transcode_jobs", "id", jobId)).toBe(0);
    expect(countWhere("segments", "job_id", jobId)).toBe(0);
    expect(countWhere("video_metadata", "video_id", videoId)).toBe(0);
    expect(countWhere("watchlist_items", "video_id", videoId)).toBe(0);

    // playback_history rows survive video deletion — same reason as above.
    expect(countWhere("playback_history", "id", historyId)).toBe(1);

    db.run("DELETE FROM libraries WHERE id = ?", [libraryId]);
    db.run("DELETE FROM playback_history WHERE id = ?", [historyId]);
  });

  it("transcode_job delete cascades to its segments only", () => {
    const { libraryId, videoId, jobId, historyId } = seedFullChain("job");

    db.run("DELETE FROM transcode_jobs WHERE id = ?", [jobId]);

    expect(countWhere("transcode_jobs", "id", jobId)).toBe(0);
    expect(countWhere("segments", "job_id", jobId)).toBe(0);

    // The video and everything else hanging off it survive — only the job + its segments go.
    expect(countWhere("videos", "id", videoId)).toBe(1);
    expect(countWhere("video_streams", "video_id", videoId)).toBe(2);
    expect(countWhere("video_metadata", "video_id", videoId)).toBe(1);
    expect(countWhere("watchlist_items", "video_id", videoId)).toBe(1);

    db.run("DELETE FROM libraries WHERE id = ?", [libraryId]);
    db.run("DELETE FROM playback_history WHERE id = ?", [historyId]);
  });
});
