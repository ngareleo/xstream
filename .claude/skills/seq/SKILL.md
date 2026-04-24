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
