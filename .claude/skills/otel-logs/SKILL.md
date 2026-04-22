---
name: otel-logs
description: Verify OTel logs from the xstream server are arriving in Seq at localhost:5341
disable-model-invocation: true
allowed-tools: Bash(grep *) Bash(cat *) Bash(lsof *)
---

You are verifying that OpenTelemetry logs and traces from the xstream server are arriving in the local Seq instance.

## Screenshots

All screenshots must be saved to `.claude/screenshots/` relative to the project root.
**Never** save screenshots to the project root or any other directory.

Use descriptive filenames prefixed with the step number, e.g. `.claude/screenshots/otel-01-seq-login.png`.

## 1. Read Seq credentials

Parse `.seq-credentials` from the project root:

```sh
grep '^SEQ_ADMIN_USERNAME=' .seq-credentials | cut -d= -f2
grep '^SEQ_ADMIN_PASSWORD=' .seq-credentials | cut -d= -f2
```

If the file does not exist, stop and report:
> `.seq-credentials` not found. Run `bun run seq:start` to generate it.

## 2. Check Seq is reachable

```sh
lsof -i :5341 | grep LISTEN
```

If nothing is listening on port 5341, stop and report:
> Seq is not running. Run `bun run seq:start`.

## 3. Log in to Seq

Navigate to `http://localhost:5341`. Take a screenshot.

If the page shows a login form:
- Fill **Username** with the value from `SEQ_ADMIN_USERNAME`
- Fill **Password** with the value from `SEQ_ADMIN_PASSWORD`
- Click **Log in**

If the page already shows the events dashboard (already logged in), skip the login step.

If Seq shows a **"password change required"** prompt after submitting credentials:
- Generate a new password: `openssl rand -base64 24 | tr -d '/+=' | head -c 32`
- Fill in **New password** and **Repeat new password** with the generated value
- Click **Log in**
- Update `.seq-credentials` with the new password: `printf 'SEQ_ADMIN_USERNAME=admin\nSEQ_ADMIN_PASSWORD=<new>\n' > .seq-credentials`

If login fails (wrong credentials, error message), stop and report the failure with a screenshot.

## 4. Check for xstream-server events

After logging in, you will be on the Events page. Take a screenshot of the current event list.

Look for log entries with `service.name = xstream-server`. To filter:
- Click the search/filter bar at the top of the events page
- Type `service.name = 'xstream-server'` and press Enter (or use the filter chips if available)
- Take a screenshot of the filtered results

## 5. Check that the expected spans are present

A pass isn't just "any entry is visible" — check that each of the spans the pipeline is supposed to open actually shows up after a playback session. Filter by `@SpanName` one at a time and confirm at least one hit per row:

| Span | Emitted by | Expected per playback session |
|---|---|---|
| `playback.session` | client | exactly 1 |
| `chunk.stream` | client | 1 per chunk streamed (≥ 1) |
| `stream.request` | server | 1 per chunk request; must share `trace_id` with its `chunk.stream` |
| `job.resolve` | server | 1 per chunk (every call to `startTranscodeJob`) |
| `transcode.job` | server | 1 only on chunks that actually spawn ffmpeg (cache hits do not produce this). **Parent must be `job.resolve`** — if the trace view shows it under the raw `HTTP POST` mutation span, the re-parenting in `chunker.startTranscodeJob` regressed. Multi-minute jobs should also carry several `transcode_progress` events. |
| `buffer.backpressure` | client | 0+ per session; conditional on the forward buffer filling to `forwardTargetS`. Zero is legitimate on short sessions or slow networks. |
| `playback.stalled` | client | 0+ per session; conditional on the `waiting` event actually firing (buffer went empty mid-playback). Zero is legitimate on a healthy fast-network session. A user reporting "lots of buffering" should produce one or more of these with `stall.duration_ms` attributes. |

If any row is empty, something in context propagation or instrumentation regressed. In particular: if `stream.request` exists but is *not* a child of any `chunk.stream` (trace view shows it as its own root), the traceparent threading in `StreamingService.start()` is broken — see `docs/observability.md` → "Threading trace context into streaming fetches".

## 6. Report result

- **PASS**: All rows in the table above produced at least one hit, and `stream.request` trace IDs match the enclosing `chunk.stream`. Report the most recent trace ID and one matching span from each row.
- **FAIL**: Any row empty, or login failed, or `stream.request` is orphaned from `chunk.stream`. Include the relevant screenshots and describe which row(s) failed.

## Notes

- Seq may show a short delay (up to 10 seconds) between log emission and UI visibility due to the OTel `BatchLogRecordProcessor` flush interval.
- If no events appear, trigger some server activity first: navigate to the player page and start playback, then wait ~10 seconds and check again.
- The `service.name` attribute is set to `xstream-server` in `server/src/telemetry.ts`.

## Programmatic access (API)

For automated trace analysis (e.g. the user pastes a Seq URL and asks "what happened in this trace?"), bypass the UI:

- **Auth by session cookie, not basic auth.** `curl -u user:pass` returns 401 "Please log in." Log in first via `POST /api/users/login` with a JSON body and capture the `Seq-Session` cookie:
  ```sh
  USER=$(grep '^SEQ_ADMIN_USERNAME=' .seq-credentials | cut -d= -f2)
  PASS=$(grep '^SEQ_ADMIN_PASSWORD=' .seq-credentials | cut -d= -f2)
  curl -s -c /tmp/seq-cookie.txt -X POST "http://localhost:5341/api/users/login" \
    -H "Content-Type: application/json" \
    -d "{\"Username\":\"$USER\",\"Password\":\"$PASS\"}" > /dev/null
  ```
  All subsequent requests use `-b /tmp/seq-cookie.txt`.
- **Filter syntax requires `@` prefix on pseudo-properties.** `@TraceId = 'xxx'`, `@SpanName = 'chunk.stream'`, `@Level = 'Warning'`. A bare `TraceId = 'xxx'` returns 0 hits without an error.
- **Request CLEF for machine-readable events**: add `&clef=true` to the events URL. Fields: `@tr` trace id, `@sp` span id, `@st` span start, `@sk` span kind, `@mt` message template, `@ra` resource attributes.

## Interpreting "missing" spans

Before concluding a span is missing due to a regression, check the session duration against the expected emission cadence — short sessions legitimately produce sparse traces:

- `chunk.stream` fires once per `CHUNK_DURATION_S = 300s` chunk streamed. A <300s session has exactly one.
- The prefetch `transcode.request` span is triggered at `chunkEnd - 60s = 240s` of playback. Sessions shorter than 240s legitimately have no prefetch span.
- `buffer.backpressure` (formerly `buffer.halt`) only opens when `bufferedAhead >= forwardTargetS` (60s default). If the network is slower than playback drains, or the session ends before the buffer fills, zero `buffer.backpressure` spans is the correct outcome — not a regression. Confirm by grepping for the `Stream paused (backpressure)` log message: if that message is absent too, back-pressure genuinely never triggered; if it's present but no `buffer.backpressure` span exists, the span-emission path in `BufferManager.checkForwardBuffer` broke.
- `playback.stalled` opens only when the HTMLMediaElement `waiting` event fires — i.e. the forward buffer actually went empty mid-playback. A healthy session over a fast network has zero; a session that experienced the user-reported "buffering" freezes should have one span per stall with a `stall.duration_ms` attribute. If the user reports buffering and this span is absent, the `waiting` listener in `PlaybackController.handleWaiting` regressed (or the span open was guarded out by `hasStartedPlayback`).
- `transcode.job` emits periodic `transcode_progress` events (~every 10s). A multi-minute job with only `transcode_started` and a terminal event — no `transcode_progress` in between — indicates either the fluent-ffmpeg `progress` callback regressed or the throttle constant is mis-set.
- `transcode.job` carries an `hwaccel` attribute naming the encoder backend (`software` \| `vaapi` \| …). When a user reports stalls, check this attribute first: a `hwaccel: software` span at 4K is expected-unviable (20 fps, below realtime) and explains stalls by itself — the fix is to unblock HW accel, not to tune buffers. A `hwaccel: vaapi` (or other HW) span still producing stalls is a different, real problem.
- `transcode_fallback_to_software` event on a `transcode.job` span means a HW encode attempt errored and the chunker retried the chunk in software. You will see two sibling `transcode.job` spans: the first with the `hwaccel` backend and the fallback event, the second with `hwaccel: software` and `hwaccel.forced_software: true`. Rare spikes in fallback events are tolerable (transient GPU contention); sustained rates suggest a broken HW path that should be investigated.
