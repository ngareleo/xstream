import type { Database } from "bun:sqlite";

export function migrate(db: Database): void {
  db.transaction(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS libraries (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        path        TEXT NOT NULL UNIQUE,
        media_type  TEXT NOT NULL,
        env         TEXT NOT NULL
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS videos (
        id                TEXT PRIMARY KEY,
        library_id        TEXT NOT NULL REFERENCES libraries(id),
        path              TEXT NOT NULL UNIQUE,
        filename          TEXT NOT NULL,
        title             TEXT,
        duration_seconds  REAL NOT NULL,
        file_size_bytes   INTEGER NOT NULL,
        bitrate           INTEGER NOT NULL,
        scanned_at        TEXT NOT NULL
      )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS videos_library_id ON videos(library_id)`);

    // Idempotent column addition — SQLite has no ALTER TABLE ADD COLUMN IF NOT EXISTS
    try {
      db.run(`ALTER TABLE videos ADD COLUMN content_fingerprint TEXT`);
    } catch {
      // column already exists on subsequent startups
    }

    db.run(`
      CREATE TABLE IF NOT EXISTS video_streams (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id     TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
        stream_type  TEXT NOT NULL,
        codec        TEXT NOT NULL,
        width        INTEGER,
        height       INTEGER,
        fps          REAL,
        channels     INTEGER,
        sample_rate  INTEGER
      )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS video_streams_video_id ON video_streams(video_id)`);

    db.run(`
      CREATE TABLE IF NOT EXISTS transcode_jobs (
        id                  TEXT PRIMARY KEY,
        video_id            TEXT NOT NULL REFERENCES videos(id),
        resolution          TEXT NOT NULL,
        status              TEXT NOT NULL,
        segment_dir         TEXT NOT NULL,
        total_segments      INTEGER,
        completed_segments  INTEGER NOT NULL DEFAULT 0,
        start_time_seconds  REAL,
        end_time_seconds    REAL,
        created_at          TEXT NOT NULL,
        updated_at          TEXT NOT NULL,
        error               TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS segments (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id           TEXT NOT NULL REFERENCES transcode_jobs(id) ON DELETE CASCADE,
        segment_index    INTEGER NOT NULL,
        path             TEXT NOT NULL,
        duration_seconds REAL,
        size_bytes       INTEGER,
        UNIQUE(job_id, segment_index)
      )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS segments_job_id ON segments(job_id)`);
  })();
}
