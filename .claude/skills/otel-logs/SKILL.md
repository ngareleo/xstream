---
name: otel-logs
description: Verify OTel logs and traces from the xstream server are arriving in Seq at localhost:5341. Use after a playback session to confirm the instrumentation pipeline is healthy.
disable-model-invocation: true
allowed-tools: Bash(curl *), Bash(grep *), Bash(cut *), Bash(jq *), Bash(date *)
---

You are verifying that OpenTelemetry logs and traces from the xstream server are arriving in the local Seq instance.

This is a **verification** skill — pass/fail check on the instrumentation pipeline. For ad-hoc trace inspection ("what happened in this trace?", "show me all `playback.stalled` spans"), use the `seq` skill directly.

All Seq access goes through the HTTP API. Do **not** drive Seq in a browser for this check; the `seq` skill owns the API mechanics (auth, filter syntax, common queries) — read it for the patterns.

## 1. Verify Seq is reachable

```sh
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:5341/
```

If not `HTTP 200`, stop and report:
> Seq is not running. Run `bun run seq:start`.

If `.seq-credentials` is missing, stop and report:
> `.seq-credentials` not found. Run `bun run seq:start` to generate it.

## 2. Authenticate

```sh
USER=$(grep '^SEQ_ADMIN_USERNAME=' .seq-credentials | cut -d= -f2)
PASS=$(grep '^SEQ_ADMIN_PASSWORD=' .seq-credentials | cut -d= -f2)
curl -s -c /tmp/seq-cookie.txt -X POST "http://localhost:5341/api/users/login" \
  -H "Content-Type: application/json" \
  -d "{\"Username\":\"$USER\",\"Password\":\"$PASS\"}" > /dev/null
```

If login fails (401), the password may need a reset — see the `devops` agent for the procedure.

## 3. Pull the most recent trace

The verification target is the most recent playback. Find its trace id:

```sh
FROM=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)
curl -s -b /tmp/seq-cookie.txt -G "http://localhost:5341/api/events" \
  --data-urlencode "filter=@MessageTemplate = 'playback.session'" \
  --data-urlencode "count=1" \
  --data-urlencode "fromDateUtc=$FROM" \
  | jq -r '.[0].TraceId'
```

If empty, no playback has happened in the last hour — trigger one (start a video at `http://localhost:5173`, wait ~10 s for the OTel batch flush, then retry).

## 4. Check that the expected spans are present

A pass isn't just "any entry is visible" — check that each expected span shows up for the trace. For each row, query and confirm at least one hit:

| Span | Emitted by | Expected per playback session |
|---|---|---|
| `playback.session` | client | exactly 1 |
| `chunk.stream` | client | 1 per chunk streamed (≥ 1) |
| `stream.request` | server | 1 per chunk request; must share `trace_id` with its `chunk.stream` |
| `job.resolve` | server | 1 per chunk (every call to `startTranscodeJob`) |
| `transcode.job` | server | 1 only on chunks that actually spawn ffmpeg (cache hits do not produce this). **Parent must be `job.resolve`** — if the trace view shows it under the raw `HTTP POST` mutation span, the re-parenting in `chunker.startTranscodeJob` regressed. Multi-minute jobs should also carry several `transcode_progress` events. |
| `buffer.backpressure` | client | 0+ per session; conditional on the forward buffer filling to `forwardTargetS`. Zero is legitimate on short sessions or slow networks. |
| `playback.stalled` | client | 0+ per session; conditional on the `waiting` event actually firing (buffer went empty mid-playback). Zero is legitimate on a healthy fast-network session. A user reporting "lots of buffering" should produce one or more of these with `stall.duration_ms` attributes. |

If any row is empty, something in context propagation or instrumentation regressed. In particular: if `stream.request` exists but is *not* a child of any `chunk.stream` (trace view shows it as its own root), the traceparent threading in `StreamingService.start()` is broken — see `docs/architecture/Observability/01-Logging-Policy.md` → "Threading trace context into streaming fetches".

Query template (substitute `TRACE_ID` and `SPAN_NAME`):

```sh
curl -s -b /tmp/seq-cookie.txt -G "http://localhost:5341/api/events" \
  --data-urlencode "filter=@TraceId = 'TRACE_ID' and @MessageTemplate = 'SPAN_NAME'" \
  --data-urlencode "count=50" \
  --data-urlencode "fromDateUtc=$(date -u -d '1 day ago' +%Y-%m-%dT%H:%M:%SZ)" \
  | jq 'length'
```

Note: span name is filtered via `@MessageTemplate` (not `@SpanName` — Seq stores OTel span names in the message template field). See the `seq` skill for the full filter-syntax reference.

If any row reports 0, something in context propagation or instrumentation regressed. In particular: if `stream.request` exists but is *not* a child of any `chunk.stream` (compare `ParentId` to a known `chunk.stream` span's `SpanId`), the traceparent threading in `StreamingService.start()` is broken — see `docs/02-Observability.md` → "Threading trace context into streaming fetches".

## 5. Report result

- **PASS**: All rows in the table above produced at least one hit, and `stream.request` trace IDs match the enclosing `chunk.stream`. Report the trace ID and one matching span from each row.
- **FAIL**: Any row empty, or `stream.request` is orphaned from `chunk.stream`. Include the failing row(s) and the actual query results.

## Notes

- Seq may show a short delay (up to 10 s) between log emission and visibility due to the OTel `BatchLogRecordProcessor` flush interval.
- If no events appear, trigger some server activity first: navigate to the player page and start playback, then wait ~10 s and check again.
- The `service.name` attribute is `xstream-server` (server) / `xstream-client` (browser) — set in `server/src/telemetry.ts` and `client/src/telemetry.ts` respectively.

## Interpreting "missing" spans

Before concluding a span is missing due to a regression, check the session duration against the expected emission cadence — short sessions legitimately produce sparse traces:

- `chunk.stream` fires once per `CHUNK_DURATION_S = 300s` chunk streamed. A <300s session has exactly one.
- The prefetch `transcode.request` span is triggered at `chunkEnd - 60s = 240s` of playback. Sessions shorter than 240s legitimately have no prefetch span.
- `buffer.backpressure` (formerly `buffer.halt`) only opens when `bufferedAhead >= forwardTargetS` (60s default). If the network is slower than playback drains, or the session ends before the buffer fills, zero `buffer.backpressure` spans is the correct outcome — not a regression. Confirm by grepping for the `Stream paused (backpressure)` log message: if that message is absent too, back-pressure genuinely never triggered; if it's present but no `buffer.backpressure` span exists, the span-emission path in `BufferManager.checkForwardBuffer` broke.
- `playback.stalled` opens only when the HTMLMediaElement `waiting` event fires — i.e. the forward buffer actually went empty mid-playback. A healthy session over a fast network has zero; a session that experienced the user-reported "buffering" freezes should have one span per stall with a `stall.duration_ms` attribute. If the user reports buffering and this span is absent, the `waiting` listener in `PlaybackController.handleWaiting` regressed (or the span open was guarded out by `hasStartedPlayback`).
- `transcode.job` emits periodic `transcode_progress` events (~every 10s). A multi-minute job with only `transcode_started` and a terminal event — no `transcode_progress` in between — indicates either the fluent-ffmpeg `progress` callback regressed or the throttle constant is mis-set.
- `transcode.job` carries an `hwaccel` attribute naming the encoder backend (`software` \| `vaapi` \| …). When a user reports stalls, check this attribute first: a `hwaccel: software` span at 4K is expected-unviable (20 fps, below realtime) and explains stalls by itself — the fix is to unblock HW accel, not to tune buffers. A `hwaccel: vaapi` (or other HW) span still producing stalls is a different, real problem.
- `transcode_fallback_to_software` event on a `transcode.job` span means a HW encode attempt errored and the chunker retried the chunk in software. You will see two sibling `transcode.job` spans: the first with the `hwaccel` backend and the fallback event, the second with `hwaccel: software` and `hwaccel.forced_software: true`. Rare spikes in fallback events are tolerable (transient GPU contention); sustained rates suggest a broken HW path that should be investigated.
