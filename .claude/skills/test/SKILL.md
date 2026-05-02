---
name: test
description: Run, analyse, and fix tests across the xstream monorepo. Use when tests are failing, adding new tests, or verifying a fix.
allowed-tools: Bash(bun *) Bash(cargo *) Bash(cd *)
---

# Testing Agent

Run, analyse, and fix tests across the xstream monorepo.

## Testing philosophy

- **Integration tests over unit tests for DB code** — query-layer tests in `server-rust/src/db/queries/<table>.rs` `mod tests` open a fresh `:memory:` SQLite per test. Mock nothing at the DB layer.
- **Unit tests for pure logic** — relay encoding/decoding, format helpers, filename parsing.
- **Component tests via Storybook** — visual state coverage lives in `*.stories.tsx` files. Play functions test interactive behaviour.
- **No mocking of the database** — the project was burned before by mock/prod divergence.
- **Real-world inputs for parsers.** Any function that parses human-generated strings (filenames, URLs) uses real examples, not invented ones. Document known limitations as expectations rather than hiding them:
  ```rust
  #[test]
  fn parse_title_documents_known_limitations() {
      // "2049" is part of the title but looks like a year — document, don't hide
      let (title, year) = parse_title_from_filename("Blade-Runner-2049-2017.mkv");
      assert_eq!(title, "Blade-Runner");
      assert_eq!(year, Some(2049));
  }
  ```

## Running tests

```bash
# Server tests (cargo)
cd server-rust && cargo test

# Client tests (vitest)
cd client && bun run test

# Run a single Rust module / test
cd server-rust && cargo test --package xstream-server db::queries::jobs

# Watch mode (client)
cd client && bun run test:watch

# Watch mode (server) — requires `cargo install cargo-watch`
cd server-rust && cargo watch -x test
```

## DB integration test pattern

Follow `server-rust/src/db/queries/jobs.rs` `mod tests`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn fresh_db() -> Db {
        Db::open(Path::new(":memory:")).expect("open in-memory db")
    }

    #[test]
    fn insert_then_get_round_trips() {
        let db = fresh_db();
        // Seed FK-required parent rows first
        seed_library(&db, "lib1");
        seed_video(&db, "lib1", "vid1");

        let job = JobRow { /* ... */ };
        insert_job(&db, &job).expect("insert");

        let fetched = get_job_by_id(&db, &job.id).expect("get");
        assert_eq!(fetched, Some(job));
    }
}
```

Key rules:
- Use `Db::open(Path::new(":memory:"))` — every test gets a fresh DB.
- Seed required parent rows (FK constraints) before the assertion path.
- Test `INSERT OR IGNORE` / `ON CONFLICT` semantics explicitly.
- Test that missing IDs return `Ok(None)`, not an error.
- For per-test temp dirs (e.g. when ffmpeg writes segments), use `tempfile::TempDir` — it cleans up automatically when the test ends.

## What to test for each query module

| File | Functions to cover |
|---|---|
| `libraries.rs` | `upsert_library` (insert + update), `get_all_libraries`, `get_library_by_id` (found + None) |
| `videos.rs` | `upsert_video` (insert + update), `replace_video_streams`, `get_video_by_id`, `get_videos_by_library` (pagination), `count_videos_by_library` |
| `jobs.rs` | `insert_job` (upsert), `update_job_status` (counts, error, COALESCE), `get_job_by_id`, `get_interrupted_jobs` |
| `segments.rs` | `insert_segment` (INSERT OR IGNORE dedup), `get_segments_by_job` (ordering), `get_segment` (found + None) |

## GraphQL integration tests

`server-rust/tests/graphql_integration.rs` drives `XstreamSchema::execute` directly against an in-memory `AppContext::for_tests`. Extend it when adding new queries or mutations. The HTTP shape is covered by the Playwright e2e tests on the client — don't re-test what's already tested at a higher layer.

## Debugging a failing test

1. Read the error message carefully — `cargo test` includes the line and a diff for `assert_eq!`.
2. Add a `dbg!(&row)` to print the actual DB row if the assertion is about a value.
3. Check that parent rows (FK constraints) are seeded before the assertion path.
4. Check that `:memory:` DBs are scoped per-test — accidentally sharing one across tests can leak state via FK cascades.
5. Re-run with `RUST_LOG=debug cargo test -- --nocapture` to see `tracing` output during a test.


## After writing — notify architect

If this task edited code or docs, spawn the `architect` subagent before marking it complete:

- **Files changed** — paths touched by `Write`/`Edit` during the task.
- **Description** — one sentence on what changed.
- **Why** — fix / feature / refactor, with issue or memory link if applicable.

Architect decides whether `docs/`, `docs/SUMMARY.md`, or the architect index needs updating, and does so directly. For trivial changes (typo, lint-only) say so explicitly — architect logs and skips. See `CLAUDE.md → Update protocol`.
