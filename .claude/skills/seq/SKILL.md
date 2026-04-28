---
name: seq
description: Query the local Seq instance (http://localhost:5341) over its HTTP API to read OTel logs and traces. Use whenever an agent needs to inspect a trace, filter spans by name, or extract event attributes — the API path is faster, cheaper, and more scriptable than driving the Seq UI in a browser. Only use the `browser` skill for Seq if a human asks you to look at the live UI.
allowed-tools: Bash(curl *), Bash(grep *), Bash(cut *), Bash(jq *), Bash(lsof *), Bash(test *), Read, Edit
---

# Seq

Read OTel logs and traces from the local Seq instance via its HTTP API. **Always prefer this skill over driving Seq in a browser** — the API is one curl call, returns parsable JSON, and skips the browser-tab cost.

## When NOT to use this skill

- The user explicitly asks to *see* Seq in the UI ("open Seq", "show me the dashboard"). Use the `browser` skill instead.
- You need to take a screenshot for the user. Use `browser`.

For everything else — "what happened in this trace?", "are there any `playback.stalled` spans today?", "give me all `transcode.job` events for job X" — stay in this skill.

## Self-update rule

When you discover a new query pattern, attribute name, or filter quirk this session, **append it to the "Tips" section of this file before finishing**. Future sessions rely on this.

## 1. Verify Seq is running

```sh
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:5341/
```

`HTTP 200` = up. Anything else, or connection refused → run `bun run seq:start` (devops skill / setup-local skill own the bring-up).

`lsof -i :5341` may not show the process if Seq runs in Docker without root — use the `curl` check first.

## 2. Authenticate (cookie-based, NOT basic auth)

`curl -u user:pass` returns `401 "Please log in."` against Seq. You must POST to `/api/users/login` and capture the `Seq-Session` cookie.

```sh
USER=$(grep '^SEQ_ADMIN_USERNAME=' .seq-credentials | cut -d= -f2)
PASS=$(grep '^SEQ_ADMIN_PASSWORD=' .seq-credentials | cut -d= -f2)
curl -s -c /tmp/seq-cookie.txt -X POST "http://localhost:5341/api/users/login" \
  -H "Content-Type: application/json" \
  -d "{\"Username\":\"$USER\",\"Password\":\"$PASS\"}" > /dev/null
```

All subsequent calls use `-b /tmp/seq-cookie.txt`. The cookie persists until Seq restarts; no need to log in again per call.

If `.seq-credentials` is missing, stop and report — `bun run seq:start` regenerates it. First login after a fresh container forces a password change (see `devops` agent for the reset procedure).

## 3. Query events

Endpoint: `GET /api/events?filter=<seq-filter>&count=<n>&fromDateUtc=<iso>`.

```sh
# Replace <FILTER> and date range as needed
FILTER="@TraceId = 'ca7fc90d4c58f84cfd9f7381b7a2c94c'"
FROM=$(date -u -d '7 days ago' +"%Y-%m-%dT%H:%M:%SZ")
curl -s -b /tmp/seq-cookie.txt -G "http://localhost:5341/api/events" \
  --data-urlencode "filter=$FILTER" \
  --data-urlencode "count=2000" \
  --data-urlencode "fromDateUtc=$FROM" | jq .
```

Returns a JSON array of event objects with `Timestamp`, `Start` (for spans), `Level`, `MessageTemplateTokens`, `Properties`, `SpanId`, `ParentSpanId`. Pipe to `jq` for slicing.

**CLEF (compact log event format)** — add `&clef=true` to get the more machine-friendly shape: `@tr` trace id, `@sp` span id, `@st` span start, `@sk` span kind, `@mt` message template, `@ra` resource attributes.

## 4. Filter syntax — read this before writing one

Seq filters use a SQL-like predicate language. Quirks that bite you:

- **Pseudo-properties require an `@` prefix.** `@TraceId`, `@SpanId`, `@ParentSpanId`, `@Level`, `@Message`, `@MessageTemplate`. A bare `TraceId = 'xxx'` returns **zero hits with no error** — silent failure. **Always prefix.**
- **Filter spans by name with `@MessageTemplate`, NOT `@SpanName`.** Seq's OTel ingestion stores the span name as the message template (the body of the span-end event). `@SpanName = 'foo'` returns 0 hits silently in this instance — `@MessageTemplate = 'foo'` is the correct filter. `@Message` also works but matches rendered messages for log records too, so `@MessageTemplate` is safer for span-only queries.
- **String values use single quotes**: `@MessageTemplate = 'chunk.stream'`.
- **User attributes are bare**: `service.name = 'xstream-server'`, `chunk.is_prefetch = true`.
- **Boolean `true`/`false` and numbers are unquoted**.
- **`like` for substring**: `@Message like '%backpressure%'`. Always anchor with `%` on the side(s) you mean.
- **Combine with `and` / `or`**: `@TraceId = 'xxx' and @Level = 'Warning'`.
- **Time defaults are narrow.** The server's default range may exclude older traces. **Always pass `fromDateUtc`** for traces older than ~24 h.

## 5. Common queries (copy/paste)

```sh
# All events for a trace
curl -s -b /tmp/seq-cookie.txt -G "http://localhost:5341/api/events" \
  --data-urlencode "filter=@TraceId = 'TRACE_ID_HERE'" \
  --data-urlencode "count=5000" \
  --data-urlencode "fromDateUtc=$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ)" | jq .

# All spans of a given name in the last day
curl -s -b /tmp/seq-cookie.txt -G "http://localhost:5341/api/events" \
  --data-urlencode "filter=@MessageTemplate = 'playback.stalled'" \
  --data-urlencode "count=200" \
  --data-urlencode "fromDateUtc=$(date -u -d '1 day ago' +%Y-%m-%dT%H:%M:%SZ)" | jq .

# Warnings/errors only, last hour
curl -s -b /tmp/seq-cookie.txt -G "http://localhost:5341/api/events" \
  --data-urlencode "filter=@Level in ['Warning', 'Error']" \
  --data-urlencode "count=100" \
  --data-urlencode "fromDateUtc=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)" | jq .

# All transcode.job spans for a specific job_id
curl -s -b /tmp/seq-cookie.txt -G "http://localhost:5341/api/events" \
  --data-urlencode "filter=@MessageTemplate = 'transcode.job' and job.id = 'JOB_ID_HERE'" \
  --data-urlencode "count=100" \
  --data-urlencode "fromDateUtc=$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ)" | jq .
```

## 6. Useful span names (xstream)

Authoritative reference: `docs/02-Observability.md`. Quick map:

| Side | Span | Notes |
|---|---|---|
| Client | `playback.session` | Root span per playback (one per video play) |
| Client | `chunk.stream` | One per chunk delivered; carries `chunk.job_id`, `chunk.start_s` |
| Client | `chunk.first_segment_append` | One per continuation chunk; measures arrival → MSE-append latency |
| Client | `transcode.request` | One per `startTranscode` mutation; `chunk.is_prefetch` flag |
| Client | `buffer.backpressure` | Healthy halt cycle; carries `buffer.target_s`, `buffer.resume_threshold_s` |
| Client | `playback.stalled` | User-visible freeze; carries `stall.duration_ms` |
| Server | `stream.request` | Child of `chunk.stream` via traceparent |
| Server | `job.resolve` | One of: `job_cache_hit`, `job_inflight_resolved`, `job_restored_from_db`, `job_started` |
| Server | `transcode.job` | ffmpeg lifetime; periodic `transcode_progress` events; `hwaccel` attribute |
| Server | `library.scan` | OMDb auto-match included as events |

Service-name attributes: `xstream-client` (browser) and `xstream-server` (Bun).

## 7. Pulling traceId from an arbitrary URL

If the user pastes a Seq URL like `http://localhost:5341/#/events?range=1d&filter=@TraceId%20%3D%20'XXX'&trace=XXX`, the trace id is the value after `&trace=` (URL-decoded). Extract with shell:

```sh
URL='<paste>'
echo "$URL" | grep -oE '[?&]trace=[a-f0-9]+' | cut -d= -f2
```

## Tips

*Appended by agents as they discover query patterns or quirks. Keep entries scoped — a one-line lesson, not an essay.*

- **`@TraceId` not `TraceId`.** A bare `TraceId = 'xxx'` returns 0 hits silently — no error, just an empty array. Always prefix with `@` for pseudo-properties (`@SpanId`, `@Level`, `@Message`, `@MessageTemplate`).
- **Span name lives in `@MessageTemplate`, not `@SpanName`.** Verified empirically against this Seq instance: `@SpanName = 'playback.session'` returns 0 hits; `@MessageTemplate = 'playback.session'` returns the actual count. Seq's OTel ingestion stores the span name as the message template body. Use `@MessageTemplate` for span filtering — it ignores rendered log records too, so it's narrower than `@Message`.
- **Default time range is narrow.** Without `fromDateUtc` Seq returns only very recent events; older traces appear missing. Always pass `--data-urlencode "fromDateUtc=$(date -u -d '7 days ago' …)"` when reaching back more than a few hours.
- **Span end-time, not start.** `Timestamp` is when the span closed; `Start` is when it opened. For ordering events chronologically, sort by `Start ?? Timestamp`. Log records have `Timestamp` only.
- **Properties is an array of `{Name, Value}`.** Convert to a map with jq: `[.Properties[] | {(.Name): .Value}] | add`.
- **MessageTemplateTokens vs RenderedMessage.** `MessageTemplateTokens` lets you reconstruct the *template* (useful for grouping); `RenderedMessage` is the interpolated final string. Prefer the template for de-duping log messages by kind.
- **Cookie expiry is silent.** If queries start returning `401`, re-run the login step — there is no warning, just a redirect to `/login`.
- **BatchLogRecordProcessor flushes ~every 10 s.** If you triggered an action and the events aren't there yet, wait ~10 s and retry; don't assume the instrumentation is broken.
- **Log record messages live in `mt` (MessageTemplateTokens[0].Text), not `msg`.** When jq-mapping events with `{mt: .MessageTemplateTokens[0].Text, msg: .RenderedMessage}`, log records have `msg: null` and the actual message text is in `mt`. Filter with `.mt | test("pattern")`, not `.msg | test(...)`.
- **`init_wait_complete` event carries `init_wait_ms` and `has_init`.** This is the canonical ffmpeg cold-start duration — time from `transcode.job` span start until the init.mp4 segment is available. `has_init: false` means the init poll timed out (60s budget, 600 attempts). Use `jq '[.[] | select(.mt == "init_wait_complete")] | sort_by(.ts) | first | .props'` to extract it per trace.
- **`job_cache_hit` vs `job_started`.** When the foreground chunk resolves to a cache hit, `init_wait_ms` is effectively 0 — the `stream_started` and `init_wait_complete` events fire within ~1 ms of the session start. Distinguish from a cold-start (`job_started`) by checking the `job.resolve` outcome event.
- **Phase 4 gap (init → video.play) is the buffer-fill wait, not a code issue.** After `init_wait_complete` fires, the client streams data into MSE until `buffered_s >= STARTUP_BUFFER_S[res]` (4K = 5 s post-tune; was 10 s). No intermediate MSE-append log events in this window — the gap is entirely ffmpeg-throughput-limited. Expect ~1–1.5 s at 4K VAAPI for the first 5 s of encoded video.
- **Eviction `current_time_s` anomaly after a seek.** If a seek jumps to a late position (e.g. 3111 s into a film), eviction logs show `current_time_s` values far ahead of the buffered range (e.g. 6132 s). This is a playback-position snapshot artifact from the pre-seek `video.currentTime` retained in the eviction state — not a real bug, but looks alarming. Cross-check with the `Seek to` log to confirm.
- **Duplicate prefetch requests after a seek (fixed).** Older traces showed a prefetch emitted twice within ~20 ms during seek handling — caused by `prefetchFired` being reset both in `handleSeeking` AND in `startChunkSeries`, letting the RAF fire across the async `buf.seek().then()` gap. Fixed by removing the redundant reset in `startChunkSeries` (callers already handle it). If a fresh trace shows duplicates, suspect a regression of that fix.
- **`transcode_complete` with `segment_count: 0` = ffmpeg exited immediately without producing output.** This means ffmpeg found no encodable frames in the requested range (e.g. the `-ss` seek landed past EOF, or a codec mismatch caused an immediate exit). The `stream.request` span still opens and waits for the init poll, burning the full 60 s before returning `init_wait_complete` with `has_init: false`. The client receives no segments and eventually times out or the user navigates away — `chunk.stream` will show `bytes_streamed: 0, segments_received: 0`. Distinguish from a cold-start delay (normal) by checking `transcode.job`'s `encode_duration_ms` — a normal 4K VAAPI cold start is ~12 s but produces segments; zero segments is the failure signal.
- **`init_wait_complete` with `has_init: false` means the 60 s init poll exhausted.** The client stream URL is open but the server never sends the init.mp4. The client hangs with 0 bytes until connection is closed server-side at ~60 s. Look for this when `chunk.stream` shows `segments_received: 0` and the stream duration is exactly ~60 s.
- **`transcode_started` `cmd` property is truncated by Seq at ~120 chars.** Every `cmd` value ends mid-argument (around `-hwaccel_output_format vaapi -i`). This is a Seq string-length storage limit, not missing instrumentation — the server logs the full command. The `-t`, video filter chain, and output pattern are never visible in Seq. To recover the full command you must correlate `job.chunk_start_s` and `job.chunk_duration_s` from the `transcode.job` span attributes with the server source code.
- **`-ss 0 -t SHORT` on VAAPI HDR 4K produces 0 segments (mitigated client-side).** Pattern: foreground `[0, 30)` cleanly exits with `segment_count: 0` while `[30, 330)` on the same file in the same session writes 150 segments. Reproduced across traces `1bac05bdb458`, `b3dbbc341c88`, `3d0f0d6f2252`. Discriminating variable is the COMBINATION of `start = 0` + short `-t` — `start > 0 -t 30` works, `start = 0 -t 300` works. Mitigated client-side: `playbackController` forces `CHUNK_DURATION_S` (300) when `startS === 0`, only uses `FIRST_CHUNK_DURATION_S` (30) for mid-file seeks. See `docs/server/Hardware-Acceleration/01-HDR-Pad-Artifact.md`. If a fresh trace shows the symptom on a non-zero `startS`, the workaround is incomplete.
- **`transcode.job` properties are nested under a `job` object.** Seq filter syntax for attributes is `job.chunk_start_s = 0` and `job.chunk_duration_s = 30`, NOT bare `chunk_start_s = 0`. A bare filter returns 0 hits silently. Same applies to `chunk.*` attributes on `chunk.stream` spans.
- **`playback.session` is a long-lived client span that closes when the user leaves the player page.** If the agent is still on the page, the span is still open and will not appear in queries. For TTFF timing during a live session, derive it from the `video.play()` log-record timestamp minus the first `Requesting chunk [0s, …)` timestamp. The `playback.time_to_first_frame_ms` attribute only appears in the closed span.
- **`dev flag` test sessions: PR #35 confirmed clean on traces `f5e7fa5a2b3f538d7b55b0a79c11403e` (Mad Max) and `b7edb6c37f716c50f0a84fd07c596c3a` (Furiosa 4K).** Both foreground `[0, 30)` jobs with `chunk_duration_s=30` produced `segment_count=15`, `has_init=true`. Pre-PR runs on the same day showed `segment_count=0` at 21:29 UTC for Mad Max, confirming the mitigation is not retroactive to cached DB jobs but fires for fresh `job_started` runs.
