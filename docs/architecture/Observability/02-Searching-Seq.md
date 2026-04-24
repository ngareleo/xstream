# Searching in Seq

**Agent workflow:** prefer the [`seq`](../../../.claude/skills/seq/SKILL.md) skill — it logs in via session cookie, queries the HTTP API, returns parsable JSON. The browser path below is for humans poking at the live UI.

## Filter syntax (both UI + API)

Pseudo-properties require an `@` prefix; bare `TraceId = '...'` returns 0 hits silently.

- Span name lives in `@MessageTemplate`, not `@SpanName`. `@MessageTemplate = 'transcode.job'` returns spans by name.
- `@TraceId`, `@SpanId`, `@ParentSpanId`, `@Level`, `@Message`, `@MessageTemplate` all need the prefix.
- User attributes are bare: `service.name = 'xstream-server'`, `chunk.is_prefetch = true`.
- String values use single quotes; booleans/numbers are unquoted; `like` for substring (`@Message like '%backpressure%'`).
- Default time range is narrow — pass `fromDateUtc` for traces older than ~24 h (UI: time picker; API: `--data-urlencode "fromDateUtc=..."`).

## In the browser UI

To find all events for a single playback session:

1. Open [http://localhost:5341](http://localhost:5341)
2. In the search bar, filter by trace ID:
   ```
   @TraceId = 'abc123...'
   ```
3. Or filter by component and time:
   ```
   component = 'chunker' and @Timestamp > 2m ago
   ```
4. Use the **Trace** view to see the parent-child span tree for a given `traceId`

## From a script / agent

Same filters, faster turnaround — auth via cookie (POST `/api/users/login`), then `GET /api/events?filter=...&count=...&fromDateUtc=...`. The `seq` skill bundles this; see [`SKILL.md`](../../../.claude/skills/seq/SKILL.md) for the curl recipes + the `clef=true` machine-readable mode.
