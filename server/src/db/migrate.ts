import type { Database } from "bun:sqlite";

/**
 * Drops leftover staging tables from a previously interrupted migration.
 * Always safe to call — `IF EXISTS` makes it a no-op when tables are absent.
 * FK enforcement is suspended for the duration so the drops never fail due to
 * an in-progress inconsistent state.
 */
function cleanupStagingTables(db: Database): void {
  db.exec("PRAGMA foreign_keys = OFF");
  db.run("DROP TABLE IF EXISTS _videos_old");
  db.run("DROP TABLE IF EXISTS _jobs_old");
  db.exec("PRAGMA foreign_keys = ON");
}

/**
 * Repairs the cascade constraints on `videos` and `transcode_jobs` if they were
 * created without ON DELETE CASCADE (pre-migration schema). SQLite does not
 * support ALTER TABLE for constraint changes, so we rename → recreate → copy.
 * This is a no-op on a fresh database because the tables are created below with
 * the correct constraints.
 *
 * FK enforcement is suspended during each rename+recreate+copy block and
 * restored immediately after so the operation is self-contained even if
 * referencing tables have rows.
 */
function repairCascadeConstraints(db: Database): void {
  const getDdl = (name: string): string | undefined =>
    (
      db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${name}'`).get() as {
        sql?: string;
      } | null
    )?.sql;

  if (getDdl("videos") && !getDdl("videos")?.includes("ON DELETE CASCADE")) {
    db.exec("PRAGMA foreign_keys = OFF");
    db.run("ALTER TABLE videos RENAME TO _videos_old");
    db.run(`
      CREATE TABLE videos (
        id                   TEXT PRIMARY KEY,
        library_id           TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
        path                 TEXT NOT NULL UNIQUE,
        filename             TEXT NOT NULL,
        title                TEXT,
        duration_seconds     REAL NOT NULL,
        file_size_bytes      INTEGER NOT NULL,
        bitrate              INTEGER NOT NULL,
        scanned_at           TEXT NOT NULL,
        content_fingerprint  TEXT NOT NULL
      )
    `);
    db.run("INSERT INTO videos SELECT * FROM _videos_old");
    db.run("DROP TABLE _videos_old");
    db.run("CREATE INDEX IF NOT EXISTS videos_library_id ON videos(library_id)");
    db.exec("PRAGMA foreign_keys = ON");
  }

  if (getDdl("transcode_jobs") && !getDdl("transcode_jobs")?.includes("ON DELETE CASCADE")) {
    db.exec("PRAGMA foreign_keys = OFF");
    db.run("ALTER TABLE transcode_jobs RENAME TO _jobs_old");
    db.run(`
      CREATE TABLE transcode_jobs (
        id                  TEXT PRIMARY KEY,
        video_id            TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
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
    db.run("INSERT INTO transcode_jobs SELECT * FROM _jobs_old");
    db.run("DROP TABLE _jobs_old");
    db.exec("PRAGMA foreign_keys = ON");
  }
}

export function migrate(db: Database): void {
  // Clean up any staging tables left behind by a previously interrupted repair.
  // Must run before repairCascadeConstraints and outside any transaction.
  cleanupStagingTables(db);

  // Must run outside the main transaction because ALTER TABLE RENAME cannot run
  // inside the same transaction as a CREATE TABLE on the same table name in SQLite.
  repairCascadeConstraints(db);

  db.transaction(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS libraries (
        id               TEXT PRIMARY KEY,
        name             TEXT NOT NULL,
        path             TEXT NOT NULL UNIQUE,
        media_type       TEXT NOT NULL,
        env              TEXT NOT NULL,
        video_extensions TEXT NOT NULL DEFAULT '[]'
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS videos (
        id                   TEXT PRIMARY KEY,
        library_id           TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
        path                 TEXT NOT NULL UNIQUE,
        filename             TEXT NOT NULL,
        title                TEXT,
        duration_seconds     REAL NOT NULL,
        file_size_bytes      INTEGER NOT NULL,
        bitrate              INTEGER NOT NULL,
        scanned_at           TEXT NOT NULL,
        content_fingerprint  TEXT NOT NULL
      )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS videos_library_id ON videos(library_id)`);

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
        video_id            TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
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

    db.run(`
      CREATE TABLE IF NOT EXISTS video_metadata (
        video_id      TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
        imdb_id       TEXT NOT NULL,
        title         TEXT NOT NULL,
        year          INTEGER,
        genre         TEXT,
        director      TEXT,
        cast_list     TEXT,
        rating        REAL,
        plot          TEXT,
        poster_url    TEXT,
        matched_at    TEXT NOT NULL
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS watchlist_items (
        id               TEXT PRIMARY KEY,
        video_id         TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
        added_at         TEXT NOT NULL,
        progress_seconds REAL NOT NULL DEFAULT 0,
        notes            TEXT,
        UNIQUE(video_id)
      )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS watchlist_video_id ON watchlist_items(video_id)`);

    db.run(`
      CREATE TABLE IF NOT EXISTS user_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  })();
}
