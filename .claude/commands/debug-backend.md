# Debug Backend

Diagnose and fix issues in the Bun server (GraphQL API, streaming endpoint, chunker, DB).

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
sqlite3 server/tmp/tvke.db

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

Server logs ffmpeg command lines at INFO level. Look for:
- `[chunker] Job XXXXXXXX started` — ffmpeg launched
- `[chunker] cmd: ffmpeg ...` — full command (truncated to 120 chars)
- `[chunker] Init segment ready` — init.mp4 written
- `[chunker] Job XXXXXXXX complete` — all segments done

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
