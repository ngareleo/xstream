//! Idempotent schema setup — the schema is whatever this file says on a fresh DB.

use rusqlite::Connection;

pub fn run(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
        BEGIN;
        CREATE TABLE IF NOT EXISTS libraries (
          id               TEXT PRIMARY KEY,
          name             TEXT NOT NULL,
          path             TEXT NOT NULL UNIQUE,
          media_type       TEXT NOT NULL,
          env              TEXT NOT NULL,
          video_extensions TEXT NOT NULL DEFAULT '[]',
          status           TEXT NOT NULL DEFAULT 'unknown'
                              CHECK (status IN ('online', 'offline', 'unknown')),
          last_seen_at     TEXT
        );
        CREATE TABLE IF NOT EXISTS films (
          id                  TEXT PRIMARY KEY,
          imdb_id             TEXT UNIQUE,
          parsed_title_key    TEXT UNIQUE,
          title               TEXT NOT NULL,
          year                INTEGER,
          created_at          TEXT NOT NULL,
          CHECK (imdb_id IS NOT NULL OR parsed_title_key IS NOT NULL)
        );
        CREATE INDEX IF NOT EXISTS films_imdb ON films(imdb_id);
        CREATE TABLE IF NOT EXISTS shows (
          id                  TEXT PRIMARY KEY,
          imdb_id             TEXT UNIQUE,
          parsed_title_key    TEXT UNIQUE,
          title               TEXT NOT NULL,
          year                INTEGER,
          created_at          TEXT NOT NULL,
          CHECK (imdb_id IS NOT NULL OR parsed_title_key IS NOT NULL)
        );
        CREATE INDEX IF NOT EXISTS shows_imdb ON shows(imdb_id);
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
          content_fingerprint  TEXT NOT NULL,
          native_resolution    TEXT,
          film_id              TEXT REFERENCES films(id) ON DELETE SET NULL,
          show_id              TEXT REFERENCES shows(id) ON DELETE SET NULL,
          show_season          INTEGER,
          show_episode         INTEGER,
          role                 TEXT NOT NULL DEFAULT 'main' CHECK (role IN ('main', 'extra'))
        );
        CREATE INDEX IF NOT EXISTS videos_library_id ON videos(library_id);
        CREATE INDEX IF NOT EXISTS videos_film_id ON videos(film_id);
        CREATE INDEX IF NOT EXISTS videos_show ON videos(show_id, show_season, show_episode);
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
        );
        CREATE INDEX IF NOT EXISTS video_streams_video_id ON video_streams(video_id);
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
        );
        CREATE TABLE IF NOT EXISTS segments (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id           TEXT NOT NULL REFERENCES transcode_jobs(id) ON DELETE CASCADE,
          segment_index    INTEGER NOT NULL,
          path             TEXT NOT NULL,
          duration_seconds REAL,
          size_bytes       INTEGER,
          UNIQUE(job_id, segment_index)
        );
        CREATE INDEX IF NOT EXISTS segments_job_id ON segments(job_id);
        CREATE TABLE IF NOT EXISTS video_metadata (
          video_id          TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
          imdb_id           TEXT NOT NULL,
          title             TEXT NOT NULL,
          year              INTEGER,
          genre             TEXT,
          director          TEXT,
          cast_list         TEXT,
          rating            REAL,
          plot              TEXT,
          poster_url        TEXT,
          poster_local_path TEXT,
          matched_at        TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS show_metadata (
          show_id           TEXT PRIMARY KEY REFERENCES shows(id) ON DELETE CASCADE,
          imdb_id           TEXT NOT NULL,
          title             TEXT NOT NULL,
          year              INTEGER,
          genre             TEXT,
          director          TEXT,
          cast_list         TEXT,
          rating            REAL,
          plot              TEXT,
          poster_url        TEXT,
          poster_local_path TEXT,
          matched_at        TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS watchlist_items (
          id               TEXT PRIMARY KEY,
          film_id          TEXT NOT NULL REFERENCES films(id) ON DELETE CASCADE,
          added_at         TEXT NOT NULL,
          progress_seconds REAL NOT NULL DEFAULT 0,
          notes            TEXT,
          UNIQUE(film_id)
        );
        CREATE INDEX IF NOT EXISTS watchlist_film_id ON watchlist_items(film_id);
        CREATE TABLE IF NOT EXISTS user_settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS playback_history (
          id          TEXT PRIMARY KEY,
          trace_id    TEXT NOT NULL,
          video_id    TEXT NOT NULL,
          video_title TEXT NOT NULL,
          resolution  TEXT NOT NULL,
          started_at  TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS playback_history_started_at ON playback_history(started_at DESC);
        CREATE TABLE IF NOT EXISTS seasons (
          show_id       TEXT    NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
          season_number INTEGER NOT NULL CHECK (season_number > 0),
          PRIMARY KEY (show_id, season_number)
        );
        CREATE TABLE IF NOT EXISTS episodes (
          show_id          TEXT    NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
          season_number    INTEGER NOT NULL,
          episode_number   INTEGER NOT NULL CHECK (episode_number > 0),
          title            TEXT,
          PRIMARY KEY (show_id, season_number, episode_number),
          FOREIGN KEY (show_id, season_number)
            REFERENCES seasons(show_id, season_number) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_episodes_show ON episodes(show_id);
        COMMIT;
        "#,
    )
}
