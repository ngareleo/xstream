# Server Spans and Logs

| Span | Trigger | Key attributes / events |
|---|---|---|
| `stream.request` | GET /stream/:jobId | `job.id`, `segments_sent` (on close events). Child of the client's `chunk.stream` span (see [`../01-Logging-Policy.md#threading-trace-context-into-streaming-fetches`](../01-Logging-Policy.md#threading-trace-context-into-streaming-fetches)). |
| `job.resolve` | `start_transcode_job()` entry — covers every code path that returns an `ActiveJob` | attrs: `job.id`, `job.video_id`, `job.resolution`, `job.chunk_start_s`. Events: `job_cache_hit` (already in `job_store`), `job_inflight_resolved` (another call was mid-registration and we polled it out), `job_restored_from_db` (completed segments replayed from disk), `job_started` (new ffmpeg spawned), `concurrency_cap_reached` (rejected because `live_active_count + reservations.size >= config.transcode.max_concurrent_jobs` (default 3), where `live_active_count = live_commands.size − dying_job_ids.size` — see `ffmpeg_pool.rs`; carries `cap.active_jobs_json` (id/video_id/chunk_start_s/status/connections per active job), `cap.inflight_ids_json`, `cap.dying_count` (number of SIGTERM'd jobs not yet exited — if non-zero and the cap is full, the SIGKILL escalation window may be the bottleneck), `cap.dying_ids_json`, `cap.requested_video_id`, `cap.requested_chunk_start_s`, `cap.requested_resolution` for diagnosis). Exactly one event fires per span. |
| `transcode.job` | ffmpeg process launch inside `start_transcode_job`. Parent is `job.resolve` (the resolution of the `job_started` path). | `job.id`, `job.video_id`, `job.resolution`, `job.chunk_start_s`, `job.chunk_duration_s`, `hwaccel` (`software` \| `vaapi` \| `videotoolbox` \| `qsv` \| `nvenc` \| `amf` — which encoder backend was used; slice stalls by this when investigating perf), `hwaccel.forced_software` (true on the retry span of a HW→software fallback), `hwaccel.vaapi_sw_pad` (true on the tier-2 retry span — VAAPI HW decode/scale + CPU pad fallback), `hwaccel.hdr_tonemap` (true when `tonemap_vaapi` was in the filter chain; if false on a known HDR source, `FFmpegFile::is_hdr` source-detection regressed). Events: `probe_complete`, `probe_error`, `transcode_started`, `transcode_progress` (periodic, ~every 10s while ffmpeg is running; `frames`, `fps`, `kbps`, `timemark`, `percent` — useful for spotting encode falling behind realtime), `transcode_fallback_to_vaapi_sw_pad` (tier 1 → tier 2 retry; carries `ffmpeg_exit_code` + `ffmpeg_stderr` 4 KB tail), `transcode_fallback_to_software` (tier 2 → tier 3 retry; same diagnostic payload), `transcode_silent_failure` (ffmpeg exited cleanly but `segment_count === 0`; carries `ffmpeg_stderr` 4 KB tail, `chunk_start_s`, `chunk_duration_s`, `encode_duration_ms`; span status set to ERROR — query with `@MessageTemplate = 'transcode_silent_failure'` in Seq), `vaapi_marked_needs_sw_pad` / `vaapi_marked_unsafe` (per-source VAAPI cache update — subsequent chunks of this video skip tier 1 or VAAPI entirely), `transcode_error`, `transcode_killed` (carries `kill_reason` ∈ `client_request` \| `client_disconnected` \| `stream_idle_timeout` \| `orphan_no_connection` \| `max_encode_timeout` \| `cascade_retry` \| `server_shutdown`), `transcode_complete`. The original span ends at the failure event; a fresh `transcode.job` span covers the retry. See [`../../server/Hardware-Acceleration/01-HDR-Pad-Artifact.md`](../../server/Hardware-Acceleration/01-HDR-Pad-Artifact.md) for the full cascade. Span duration is the full ffmpeg lifetime (probe + encode). |
| `library.scan` | `scanLibraries` | `library_path`, `library_name`, `files_found` |

Structured log events are emitted for each significant state transition (init ready, transcode complete, scan matched, etc.) with a `component` attribute for easy filtering. When a span event already covers a state transition, do not emit a duplicate log record — prefer `span.addEvent()` over a parallel `log.info()`.

---

## Per-request access log (Rust)

The server emits one structured `info`-level log per HTTP request. Five fields are guaranteed — Seq queries can lock to them:

| Field | Type | Notes |
|---|---|---|
| `method` | string | HTTP verb |
| `path` | string | Request path (no query string) |
| `status` | integer | HTTP response status code |
| `duration_ms` | number | Wall-clock request duration in milliseconds |
| `trace_id` | string | Extracted from inbound `traceparent`; empty string when no traceparent present |

**Message body shape:**

`${method} ${path} ${status} — ${ms}ms (trace=${id})`

When no inbound `traceparent` is present: `trace_id` is empty string, body renders `(trace=-)`.

The server pulls `trace_id` from the `OtelContext` populated by the tracing middleware. To find the access log for a specific trace: `trace_id = '<id>'` (or grep the body for `trace=<id>`).

---

## ErrorLogger async-graphql extension (Rust)

A per-request async-graphql extension fires `tracing::error!` for each entry in `response.errors`, executed inside the existing `http.request` span. Because tracing-opentelemetry attaches the inbound `TraceId` to every OTLP export, Seq automatically groups these error events with their originating request.

**Structured fields emitted per error entry:**

| Field | Value |
|---|---|
| `graphql.error_message` | The error message string |
| `graphql.error_path` | The field path where the error occurred |
| `graphql.error_locations` | Source location(s) from the GraphQL response |

**Effect:** every resolver error → typed `errors[]` response → `tracing::error!` event in Seq, correlated to the request span by `TraceId`. Resolvers added in Step 2 (streaming cutover) do not need to add their own error logging; the extension covers them automatically.
