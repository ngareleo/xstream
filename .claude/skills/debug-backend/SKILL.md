---
name: debug-backend
description: Diagnose and fix issues in the Bun server — GraphQL API, streaming endpoint, chunker, DB. Use when server returns unexpected results, jobs get stuck, or streams fail.
allowed-tools: Bash(bun *) Bash(curl *) Bash(sqlite3 *) Bash(ffprobe *) Bash(ls *)
---

# Debug Backend

Diagnose and fix issues in the Bun server (GraphQL API, streaming endpoint, chunker, DB).

For ffmpeg/VAAPI/OMDb/dev-server-port triage, delegate to the `devops` subagent — it owns those playbooks and scans `.github/workflows/`, `scripts/`, and `.env.example` before answering.

## Start the server in dev mode

```bash
cd server && bun run dev
```

Server listens on `http://localhost:3001` by default (configured in `src/config.ts`).

## GraphQL API debugging

### Run a query against the live server
```bash
curl -s -X POST http://localhost:3001/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ libraries { id name } }"}' | jq .
```

### Introspect the schema
```bash
curl -s -X POST http://localhost:3001/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __schema { types { name } } }"}' | jq '.data.__schema.types[].name'
```

### Test a mutation
```bash
curl -s -X POST http://localhost:3001/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { scanLibraries { id name } }"
  }' | jq .
```

### Start a transcode job
```bash
curl -s -X POST http://localhost:3001/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation Start($vid: ID!, $res: Resolution!) { startTranscode(videoId: $vid, resolution: $res) { id status } }",
    "variables": { "vid": "VIDEO_GLOBAL_ID", "res": "RESOLUTION_1080P" }
  }' | jq .
```

## Streaming endpoint debugging

```bash
# Check the binary stream (first 1KB = length prefix + init segment header)
curl -s "http://localhost:3001/stream/JOB_ID" | xxd | head -20

# Stream from a specific segment offset
curl -s "http://localhost:3001/stream/JOB_ID?from=5" | xxd | head -4
```

The first 4 bytes are a big-endian uint32 (length of the following fMP4 init segment).

## Database inspection

```bash
# Open the SQLite DB directly (dev path)
sqlite3 server/tmp/xstream.db

# List all tables
.tables

# Check transcode jobs
SELECT id, status, completed_segments, total_segments FROM transcode_jobs ORDER BY created_at DESC LIMIT 10;

# Check segments for a job
SELECT segment_index, path, size_bytes FROM segments WHERE job_id = 'JOB_ID' ORDER BY segment_index;

# Check videos
SELECT id, title, filename, duration_seconds FROM videos LIMIT 20;
```

## Chunker / ffmpeg debugging

Most of the chunker's lifecycle is now captured as OpenTelemetry span events rather than free-form log lines. To trace a job end-to-end, prefer Seq over `tail -f` on stdout — invoke the `seq` skill (HTTP API) rather than driving the Seq UI in a browser.

In Seq, search for the `job.resolve` span for a given `job_id`. Its single event tells you which resolution path fired:
- `job_cache_hit` — job was already running; call was a no-op
- `job_inflight_resolved` — another call was mid-registration, we polled it out
- `job_restored_from_db` — completed segments replayed from disk (no ffmpeg spawn)
- `job_started` — new ffmpeg process launched; a child `transcode.job` span follows

Still emitted as plain logs (useful for stdout tailing):
- `[chunker] cmd: ffmpeg ...` — full command (truncated to 120 chars)
- `[chunker] Init segment ready` — init.mp4 written
- `[chunker] Job XXXXXXXX complete` — all segments done
- `[chunker] Killing ffmpeg — <kill_reason>` — always includes `kill_reason` (e.g. `client_disconnected`, `server_shutdown`, `stream_idle_timeout`, `orphan_no_connection`)

To see the full ffmpeg command, temporarily add a longer log in `services/chunker.ts`:
```typescript
console.log(`[chunker] cmd: ${cmd}`); // remove the slice
```

Check the segment directory:
```bash
ls -la server/tmp/segments/JOB_ID/
# Should see: init.mp4, segment_0000.m4s, segment_0001.m4s, ...
```

Validate an fMP4 segment:
```bash
ffprobe server/tmp/segments/JOB_ID/segment_0000.m4s 2>&1 | grep Stream
```

## Common issues

| Symptom | Likely cause | Fix |
|---|---|---|
| GraphQL returns `null` for a field | Resolver returns `undefined` | Check presenter function returns the correct shape |
| `ffprobe failed` in logs | File path wrong or file missing | Check `video.path` in DB matches the actual file |
| Stream hangs after init segment | `watcher` didn't catch early segments | Check `watchSegments` registered before `.run()` |
| `InvalidStateError` in client | `appendBuffer` called while `updating` | BufferManager wasn't awaiting `updateend` |
| Jobs stuck in `running` after restart | Server marks them `error` on startup | Expected — client must call `startTranscode` again |

## Running server tests

```bash
cd server && bun test

# Single file
bun test src/db/queries/jobs.test.ts

# Watch
bun test --watch
```


## After writing — notify architect

If this task edited code or docs, spawn the `architect` subagent before marking it complete:

- **Files changed** — paths touched by `Write`/`Edit` during the task.
- **Description** — one sentence on what changed.
- **Why** — fix / feature / refactor, with issue or memory link if applicable.

Architect decides whether `docs/`, `docs/SUMMARY.md`, or the architect index needs updating, and does so directly. For trivial changes (typo, lint-only) say so explicitly — architect logs and skips. See `CLAUDE.md → Update protocol`.
