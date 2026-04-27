# Database Layer — Bun → Rust Migration

**Scope.** SQLite schema, connection management, migration semantics, query layer convention, and the forward "two databases" split that peer-sharing requires.

**Read first.**

- [`server/DB-Schema/00-Tables.md`](../../server/DB-Schema/00-Tables.md) — full schema with column types and design decisions (WAL, SHA-1 IDs, no ORM)
- [`code-style/Invariants/00-Never-Violate.md`](../../code-style/Invariants/00-Never-Violate.md) — invariant #1 (all SQL routes through `db/queries/`), #5 (`content_fingerprint NOT NULL`)

---

## 1. Current Bun implementation

### 1.1 Connection — `server/src/db/index.ts` (21 lines)

```ts
import { Database } from "bun:sqlite";
import { config } from "../config.js";
import { migrate } from "./migrate.js";

let _db: Database | null = null;

export function getDb(): Database {
  if (!_db) {
    _db = new Database(config.dbPath, { create: true });
    _db.exec("PRAGMA journal_mode = WAL;");
    _db.exec("PRAGMA foreign_keys = ON;");
    migrate(_db);
  }
  return _db;
}

export function closeDb(): void {
  _db?.close();
  _db = null;
}
```

Single global connection. Two pragmas, both load-bearing:

- **`journal_mode = WAL`** — concurrent reads with writers (the library scanner writes while resolvers read).
- **`foreign_keys = ON`** — SQLite defaults this OFF; FK constraints in the schema are no-ops without this pragma.

`migrate()` runs on first `getDb()` call (idempotent — `CREATE TABLE IF NOT EXISTS`).

`closeDb()` called from the SIGTERM handler in `index.ts:121` flushes WAL on shutdown.

### 1.2 Schema — `server/src/db/migrate.ts` (131 lines)

Eight tables, all created inside a single `db.transaction(() => { ... })()`. Full schema lives in [`server/DB-Schema/00-Tables.md`](../../server/DB-Schema/00-Tables.md). Quick map:

| Table | Purpose | Notable |
|---|---|---|
| `libraries` | Library roots | SHA-1 of path is PK; `path UNIQUE` |
| `videos` | One row per scanned file | `path UNIQUE`; `content_fingerprint NOT NULL` (SHA-1 of first 64 KB + size); FK to `libraries` |
| `video_streams` | Codec streams (one video + one audio per file typically) | `AUTOINCREMENT id`; CASCADE on video delete |
| `transcode_jobs` | One row per `(content_fingerprint, resolution, start, end)` request | SHA-1 of those four fields is PK |
| `segments` | One row per `.m4s` file | `UNIQUE(job_id, segment_index)`; CASCADE on job delete |
| `video_metadata` | OMDb match results | `video_id PK`; CASCADE on video delete |
| `watchlist_items` | User watchlist | `UNIQUE(video_id)` |
| `user_settings` | Key-value blob (OMDB API key, feature flags, etc.) | `key PK` |
| `playback_history` | Trace ID → playback session log | Indexed by `started_at DESC` |

The schema is **append-only** during active development. No down migrations, no schema versioning — when a breaking change is needed, the `tmp/xstream.db` file is deleted (cf. the `content_fingerprint` migration note in the schema doc).

### 1.3 Query layer — `server/src/db/queries/` (eight files, ~600 lines total)

| File | Lines | Surface |
|---|---|---|
| `libraries.ts` | 90 | upsert, create, delete, getAll, getById, update |
| `videos.ts` | 172 | upsert, replaceVideoStreams, getById, paginated list, count, sum-size, getStreamsByVideoId, getVideos (cross-library) |
| `jobs.ts` | 104 | insert, updateJobStatus, getById, getInterruptedJobs, deleteById, getLruJobs (with size aggregate), markJobEvicted |
| `segments.ts` | 35 | insert (`OR IGNORE`), getByJob, getSegment, deleteByJob |
| `videoMetadata.ts` | 85 | upsert, get, delete, countMatchedByLibrary |
| `watchlist.ts` | 56 | add, remove, updateProgress, getAll, getById |
| `userSettings.ts` | 23 | get, set |
| `playbackHistory.ts` | 37 | insert, list (by started_at DESC) |

**Invariant #1**: every SQL string in the codebase appears inside one of these files. No `prepare()` calls leak elsewhere. The Rust port's module structure mirrors this 1:1 (`server/src/db/queries/<table>.rs`).

### 1.4 Bun-SQLite query API

The codebase uses Bun's `$param`-style placeholders consistently:

```ts
// jobs.ts:32-57 — typical pattern
export function updateJobStatus(
  id: string,
  status: TranscodeJobRow["status"],
  extra: Partial<...> = {}
): void {
  getDb()
    .prepare(`
      UPDATE transcode_jobs SET
        status = $status,
        completed_segments = COALESCE($completed_segments, completed_segments),
        ...
      WHERE id = $id
    `)
    .run({
      $id: id,
      $status: status,
      $completed_segments: extra.completed_segments ?? null,
      ...
    });
}
```

`Database.prepare(...)` returns a statement; `.run(params)` for INSERTs/UPDATEs/DELETEs, `.get(params)` for `SELECT` returning one row, `.all(params)` for many. The Bun runtime returns plain JS objects shaped by column name.

**Idiom worth flagging:**

- `INSERT OR REPLACE` for upserts when the conflict target is the PK (`jobs.ts:8`)
- `INSERT ... ON CONFLICT(<col>) DO UPDATE SET <col> = excluded.<col>` for upserts on non-PK unique columns (`videos.ts:8-19`, `libraries.ts:9-18`)
- `INSERT OR IGNORE` for race-safe writes where the duplicate is benign (`segments.ts:6`)
- Dynamic `WHERE` building: a `conditions: string[]` + `params: Record<...>` accumulator (`videos.ts:69-96, 122-156`) — a common pattern that translates cleanly to Rust string-builder + parameter-array

### 1.5 Boot integration

`getDb()` is called once at boot from `index.ts:42`:

```ts
getDb();              // opens connection, sets pragmas, runs migrations
log.info("Database ready");
```

Subsequent callers from query modules get the cached connection. No connection pool — single-threaded JS makes this safe.

---

## 2. Stable contracts (must not change)

| Contract | Where | Rust port must |
|---|---|---|
| Schema (every table, column, PK, FK, UNIQUE, INDEX) | `migrate.ts` | Identical — verified by ALTER-SCHEMA-IF-NOT-EXISTS idempotent migration |
| `content_fingerprint` formula: SHA-1 of first 64 KB, formatted as `<sizeBytes>:<sha1hex>` | scattered (chunker, scanner) | Compute byte-identically (`sha1` crate over the first 64 KB; format the same way) |
| WAL mode + foreign keys ON | `db/index.ts:11-12` | Set the same pragmas (Rust port: at connection-creation time, BEFORE any query runs) |
| All SQL routes through `db/queries/` | invariant #1 | Same module structure in Rust |
| Append-only migration policy | implicit | Same — no down migrations, no schema-version table; bump file name on breaking change |
| Job ID derivation: `sha1(contentKey \| resolution \| start \| end)` | `chunker.ts:134-138` | Same (cf. [`01-Streaming-Layer.md`](01-Streaming-Layer.md)) |
| Library ID = SHA-1 of `path` | `libraries.ts:35` | Same |
| Video ID = SHA-1 of `path` | (computed in scanner) | Same |
| `tmp/xstream.db` default location, `DB_PATH` env override | `config.ts:28, 36` | Same |

---

## 3. Rust target shape

### 3.1 Crate selection: `rusqlite` (bundled)

Locked pick: **`rusqlite` with the `bundled` feature** (compiles SQLite from source — no system `libsqlite3` dependency, satisfies the Tauri "no apt install" rule).

Why not `sqlx`?

- `sqlx` adds compile-time query checking — strictly safer, but requires a live database during `cargo build` (or `prepare` step), complicating CI and tooling for a Tauri-bundled app.
- `sqlx` requires async runtime hooks for PRAGMAs (`after_connect` on the pool); `rusqlite` lets us set them inline before any query.
- `sqlx`'s pool model presumes multiple concurrent connections; xstream's load is dominated by a single library-scanner writer plus low-contention reads, so a single connection (or a small `r2d2` pool of 2-4) is sufficient.

Revisit `sqlx` if compile-time query checking becomes a felt need — the migration is mechanical (every query function gains a `query_as!` macro).

| Concern | Crate |
|---|---|
| SQLite | `rusqlite` (`bundled` feature) |
| Connection pool (optional, only if multi-thread contention emerges) | `r2d2` + `r2d2-sqlite` |
| Hashing | `sha1` (cf. [`01-Streaming-Layer.md`](01-Streaming-Layer.md)) |
| Async hand-off | `tokio::task::spawn_blocking` for query execution if needed |

`rusqlite` is synchronous. axum handlers running queries either:
- (a) Call query functions directly inside the async handler — fast queries (single-row `SELECT` by PK) finish in microseconds and don't meaningfully block the runtime.
- (b) Wrap longer queries in `tokio::task::spawn_blocking(|| db::queries::...)` for queries that touch many rows or do aggregation (`getLruJobs`, `getVideos` with filters).

### 3.2 Connection setup

```rust
pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE | OpenFlags::SQLITE_OPEN_FULL_MUTEX,
    )?;
    // Pragmas BEFORE any query — same constraint as the Bun version.
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    migrate::run(&conn)?;
    Ok(conn)
}
```

`SQLITE_OPEN_FULL_MUTEX` makes the connection thread-safe for use across `spawn_blocking` boundaries (rusqlite also supports `Arc<Mutex<Connection>>` if FULL_MUTEX is judged overkill).

### 3.3 Query function shape

```rust
// db/queries/jobs.rs

pub fn insert(conn: &Connection, row: &TranscodeJobRow) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO transcode_jobs
         (id, video_id, resolution, status, segment_dir, total_segments, completed_segments,
          start_time_seconds, end_time_seconds, created_at, updated_at, error)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            row.id, row.video_id, row.resolution, row.status, row.segment_dir,
            row.total_segments, row.completed_segments, row.start_time_seconds,
            row.end_time_seconds, row.created_at, row.updated_at, row.error,
        ],
    )?;
    Ok(())
}

pub fn get_by_id(conn: &Connection, id: &str) -> rusqlite::Result<Option<TranscodeJobRow>> {
    conn.query_row(
        "SELECT * FROM transcode_jobs WHERE id = ?1",
        params![id],
        TranscodeJobRow::from_row,
    ).optional()
}

pub fn get_interrupted(conn: &Connection) -> rusqlite::Result<Vec<TranscodeJobRow>> {
    let mut stmt = conn.prepare("SELECT * FROM transcode_jobs WHERE status = 'running'")?;
    let rows = stmt.query_map([], TranscodeJobRow::from_row)?;
    rows.collect()
}
```

### 3.4 Row structs and `FromRow`

```rust
#[derive(Debug, Clone)]
pub struct TranscodeJobRow {
    pub id: String,
    pub video_id: String,
    pub resolution: String,         // kebab-case mirror of GraphQL enum
    pub status: String,             // "pending" | "running" | "complete" | "error"
    pub segment_dir: String,
    pub total_segments: Option<i64>,
    pub completed_segments: i64,
    pub start_time_seconds: Option<f64>,
    pub end_time_seconds: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
    pub error: Option<String>,
}

impl TranscodeJobRow {
    fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            video_id: row.get("video_id")?,
            resolution: row.get("resolution")?,
            status: row.get("status")?,
            segment_dir: row.get("segment_dir")?,
            total_segments: row.get("total_segments")?,
            completed_segments: row.get("completed_segments")?,
            start_time_seconds: row.get("start_time_seconds")?,
            end_time_seconds: row.get("end_time_seconds")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
            error: row.get("error")?,
        })
    }
}
```

**Named-column access** (`row.get("name")`) over indexed access — Bun's column-name JS objects map cleanly to this. The Rust port forces every row shape to be declared up front, which is strictly better than the implicit object literals in the Bun queries.

### 3.5 Dynamic WHERE building

The pattern at `videos.ts:60-96` (conditions array + params dict) translates to:

```rust
pub fn list_by_library(
    conn: &Connection,
    library_id: &str,
    limit: i64,
    offset: i64,
    filter: &VideoFilter,
) -> rusqlite::Result<Vec<VideoRow>> {
    let mut sql = String::from("SELECT v.* FROM videos v WHERE v.library_id = ?1");
    let mut params: Vec<Box<dyn ToSql>> = vec![Box::new(library_id.to_string())];

    if let Some(search) = &filter.search {
        sql.push_str(" AND v.title LIKE ?");
        sql.push_str(&format!("{}", params.len() + 1));
        params.push(Box::new(format!("%{search}%")));
    }
    if let Some(media_type) = &filter.media_type {
        sql.push_str(&format!(
            " AND EXISTS (SELECT 1 FROM libraries l WHERE l.id = v.library_id AND l.media_type = ?{})",
            params.len() + 1,
        ));
        params.push(Box::new(media_type.to_string()));
    }
    sql.push_str(&format!(" ORDER BY v.title, v.filename LIMIT ?{} OFFSET ?{}",
        params.len() + 1, params.len() + 2));
    params.push(Box::new(limit));
    params.push(Box::new(offset));

    let mut stmt = conn.prepare(&sql)?;
    let param_refs: Vec<&dyn ToSql> = params.iter().map(|b| &**b as &dyn ToSql).collect();
    let rows = stmt.query_map(rusqlite::params_from_iter(param_refs.iter().copied()), VideoRow::from_row)?;
    rows.collect()
}
```

A small `query_builder` helper in `db/queries/_common.rs` is worth extracting once the second dynamic-WHERE query lands — keeps the index-counting bookkeeping in one place.

### 3.6 Migrations

```rust
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
          video_extensions TEXT NOT NULL DEFAULT '[]'
        );
        CREATE TABLE IF NOT EXISTS videos (...);
        -- and so on for every table from migrate.ts
        COMMIT;
        "#,
    )
}
```

Single `execute_batch` call wraps everything in a transaction; on any error, no tables are partially created.

### 3.7 Connection ownership

`AppState` owns the connection (or pool):

```rust
#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    // ... other state
}
```

Or with `r2d2`:

```rust
pub struct AppState {
    pub db: Pool<SqliteConnectionManager>,
    ...
}
```

Pool is preferable once a second writer thread enters (e.g. the library scanner runs on its own task). Single connection is fine for the first cut.

---

## 4. Forward constraints for peer-sharing

### 4.1 Two databases, not one — identity DB separate from cache DB

Today there is one DB at `tmp/xstream.db` — transient, alongside the segment cache at `tmp/segments/`. A user wiping `tmp/` to clear the cache also wipes:

- Library indexing (acceptable — re-scan on next boot)
- Watchlist + match metadata (acceptable but annoying)
- **Peer identity (NOT acceptable when sharing ships)** — node keypair, trusted-peer records, issued/received invite tokens. Wiping these breaks every active share session.

**Forward design:** a second SQLite database in the **persistent app-data directory** (Tauri's `app_data_dir()`):

```
$XDG_CONFIG_HOME/xstream/identity.db   (Linux)
~/Library/Application Support/xstream/identity.db   (macOS)
%APPDATA%\xstream\identity.db                       (Windows)
```

Tables (NOT to be added in this port — listed for forward awareness):

```sql
-- identity.db (NEW, not in this port)
CREATE TABLE node_identity (
    id              INTEGER PRIMARY KEY,
    public_key      BLOB NOT NULL,
    private_key     BLOB NOT NULL,    -- encrypted at rest via Tauri stronghold or platform keychain
    created_at      TEXT NOT NULL
);

CREATE TABLE trusted_peers (
    node_id         TEXT PRIMARY KEY,    -- hex of peer's public key
    display_name    TEXT NOT NULL,
    added_at        TEXT NOT NULL,
    last_seen_at    TEXT
);

CREATE TABLE issued_invites (
    token           TEXT PRIMARY KEY,    -- base64 of signed payload
    peer_node_id    TEXT NOT NULL,
    scope           TEXT NOT NULL,        -- JSON: { type: "video"|"library", ids: [...] }
    expires_at      TEXT NOT NULL,
    created_at      TEXT NOT NULL
);
```

The Rust port today opens **only** `tmp/xstream.db` (the cache DB). When sharing ships, a second connection opens `app_data_dir/identity.db`. The seam: `AppState.cache_db` and `AppState.identity_db` (the latter `Option<...>` until sharing). State this in the doc-comment.

**Constraint:** do NOT store identity/sharing metadata in the transient `tmp/` tree. Future agents adding a "trusted peers list" feature must read this section and put the table in `identity.db`.

### 4.2 Job dedup is content-addressable across peers, not local-only

Today `transcode_jobs.id = sha1(content_fingerprint | resolution | start | end)`. The `content_fingerprint` is `<sizeBytes>:<sha1hex_of_first_64KB>`. **Two peers with the same source video produce the same job ID** — content-addressable.

Implication for sharing: when peer B asks peer A to transcode a video B has locally (a "have you already done this?" lookup before requesting transcode + stream), peer B can compute the predicted job ID from its own copy and check peer A's job store. This optimization is out of scope for the first port but is enabled by the existing schema — flag this so a future agent doesn't break the property by changing the ID derivation.

The chunker invariant from [`01-Streaming-Layer.md`](01-Streaming-Layer.md) §4.1 (job ID and segment cache key are decoupled) layers on top: even if two peers compute the same job ID, the segment-directory layout is keyed by job ID and the cache lookup is keyed by `(content_fingerprint, resolution, start, end)` — both peers hit the same on-disk cache.

### 4.3 `playback_history.trace_id` is already cross-peer compatible

The `playback_history.trace_id` column stores the W3C trace ID for the playback session (`schema.ts:191-196`, `playbackHistory.ts`). When peer B plays a video from peer A, peer B's session creates a new trace ID; peer A's `stream.request` spans nest under it via the `traceparent` header. Peer A's `playback_history` does NOT receive a row (peer A wasn't initiating playback) — peer B's history records the cross-peer session correctly. No schema change needed.

### 4.4 Library scoping for shared content

When peer B receives a library-share invite from peer A, peer B's `videos` table doesn't represent peer A's content directly — peer B should NOT scan files it doesn't own. Two possible designs:

- **Virtual library rows**: a `libraries` row with a non-local `path` (e.g. `peer://<peerNodeId>/movies`) and `videos` rows synced over GraphQL. Risks: scanner code paths assume local filesystem.
- **Separate `peer_videos` table**: shadow schema for remote content, joined at the GraphQL layer.

**Out of scope for this port. Listed for the Sharing doc.** Today's schema represents only locally-owned content; the Rust port preserves that property.

### 4.5 SQLite over network — explicitly NOT supported

For absolute clarity: the Rust port does not — and must not — expose the SQLite file over the network. All cross-peer interaction goes through GraphQL + the streaming endpoint. Any future "let peer B query peer A's library directly" feature must be GraphQL-mediated, not DB-mediated.

---

## 5. Open questions

1. **`rusqlite` blocking I/O in async handlers.** Most queries finish in microseconds — the cost of `spawn_blocking` (a context switch) outweighs the benefit. The convention proposed in §3.1 (direct call for fast queries, `spawn_blocking` for aggregation queries) is heuristic; verify with a flame graph during implementation.

2. **Connection pool sizing.** Single connection or `r2d2` pool of N? The library scanner is currently the only writer; under sharing, peer-shared libraries might add a second writer (peer-metadata sync). Start single-connection; revisit if contention emerges.

3. **Migration tooling.** Today's `migrate.ts` is hand-rolled; idempotent via `CREATE TABLE IF NOT EXISTS`. Rust ecosystem has `refinery` and `sqlx::migrate!`. The plan keeps the hand-rolled approach (one `execute_batch` call) — it's 30 LoC, no new dep, and the schema has no down migrations to manage. Adopt a migration crate only if schema versioning becomes load-bearing.

4. **`bun:sqlite` vs `rusqlite` parameter binding.** Bun uses named placeholders (`$id`, `$name`, ...). `rusqlite` supports both `?N` positional and named (`:id`, `:name`) via `named_params!`. The Rust port can match Bun's style with `named_params!` for readability — recommended over positional `?N` for queries with many columns. Cosmetic, doesn't affect correctness.

5. **WAL and Tauri.** Under Tauri, the user's `tmp/xstream.db` lives in the app's tmp directory (or wherever `DB_PATH` points). WAL produces sidecar files (`xstream.db-wal`, `xstream.db-shm`); confirm Tauri's resource cleanup doesn't accidentally remove only the main DB file leaving WAL orphans. Test before declaring Tauri parity.

---

## 6. Critical files reference

| File | Lines | Role in the port |
|---|---|---|
| `server/src/db/index.ts` | 21 | Connection bootstrap — replaced by `db::open(path)` returning `Connection` |
| `server/src/db/migrate.ts` | 131 | Idempotent schema — replaced by single `execute_batch` |
| `server/src/db/queries/libraries.ts` | 90 | Library CRUD + dynamic update |
| `server/src/db/queries/videos.ts` | 172 | Video CRUD + paginated list with dynamic WHERE |
| `server/src/db/queries/jobs.ts` | 104 | Job CRUD + LRU aggregation + eviction marker |
| `server/src/db/queries/segments.ts` | 35 | Race-safe segment writes |
| `server/src/db/queries/videoMetadata.ts` | 85 | OMDb match storage |
| `server/src/db/queries/watchlist.ts` | 56 | Watchlist CRUD |
| `server/src/db/queries/userSettings.ts` | 23 | Key-value settings |
| `server/src/db/queries/playbackHistory.ts` | 37 | Trace-ID-keyed session log |
| `server/src/types.ts` | 141 | Row struct shapes (`LibraryRow`, `VideoRow`, `TranscodeJobRow`, …) |
| `server/src/config.ts` | 102 | `dbPath` (extend with `cache_db_path` + `identity_db_path` when sharing ships) |
