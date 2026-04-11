# Testing Agent

Run, analyse, and fix tests across the tvke monorepo.

## Testing philosophy

- **Integration tests over unit tests for DB code** — tests in `server/src/db/queries/` spin up a real SQLite database in a temp directory. Mock nothing at the DB layer.
- **Unit tests for pure logic** — relay encoding/decoding (`relay.test.ts`), format helpers, pure functions.
- **Component tests via Storybook** — visual state coverage lives in `*.stories.tsx` files. Play functions test interactive behaviour.
- **No mocking of the database** — the project was burned before by mock/prod divergence.

## Running tests

```bash
# Server tests (bun:test)
cd server && bun test

# Client tests (vitest)
cd client && bun run test

# Run a single file
cd server && bun test src/db/queries/jobs.test.ts

# Watch mode
cd client && bun run test:watch
```

## DB integration test pattern

Follow `server/src/db/queries/jobs.test.ts`:

```typescript
const TEST_DIR = join(tmpdir(), `tvke-<table>-test-${Date.now()}`);
mkdirSync(TEST_DIR, { recursive: true });
process.env.DB_PATH = join(TEST_DIR, "test.db");

// Import AFTER setting DB_PATH
const { myQueryFn } = await import("./myTable.js");
const { getDb } = await import("../index.js");

afterAll(() => {
  try { getDb().close(); } catch { /* already closed */ }
  rmSync(TEST_DIR, { recursive: true, force: true });
});

beforeAll(() => {
  // Seed FK-required parent rows with raw SQL
  getDb().prepare(`INSERT OR IGNORE INTO libraries ...`).run();
});
```

Key rules:
- Set `DB_PATH` env var **before** importing any module that touches the DB
- Clean up the temp dir in `afterAll`
- Seed required parent rows (FK constraints) in `beforeAll`
- Test `INSERT OR IGNORE` / `ON CONFLICT` semantics explicitly
- Test that missing IDs return `null`, not an exception

## What to test for each query file

| File | Functions to cover |
|---|---|
| `libraries.ts` | upsertLibrary (insert + update), getAllLibraries, getLibraryById (found + null) |
| `videos.ts` | upsertVideo (insert + update), replaceVideoStreams, getVideoById, getVideosByLibrary (pagination), countVideosByLibrary |
| `jobs.ts` | insertJob (upsert), updateJobStatus (counts, error, COALESCE), getJobById, getInterruptedJobs |
| `segments.ts` | insertSegment (INSERT OR IGNORE dedup), getSegmentsByJob (ordering), getSegment (found + null) |

## GraphQL integration tests

`server/src/graphql/graphql.integration.test.ts` tests the full GraphQL layer against an in-memory schema + mock DB. Extend it when adding new queries or mutations.

## Debugging a failing test

1. Read the error message carefully — bun:test shows the exact assertion
2. Add a `console.log` to print the actual DB row if the assertion is about a value
3. Check that parent rows (FK constraints) are seeded in `beforeAll`
4. Check that `DB_PATH` is set before any import touches the DB
5. If `getDb()` is being called before migration runs, ensure the import order is correct
