---
name: browser
description: Drive a browser with Playwright MCP — navigate, click, fill, snapshot, inspect console, verify UI. Also covers Tauri-mode debugging via the Rsbuild dev URL (`:5173`) while `bun run tauri:dev` runs, plus native-window screenshots when the Tauri shell itself needs visual verification. For reading Seq logs/traces use the `seq` skill (HTTP API) instead — only fall back to driving Seq in a browser if the user explicitly asks to see the live UI. The "Known Quirks" section is self-maintained — when a new page-specific gotcha is discovered this session, append it before finishing.
allowed-tools: mcp__playwright__browser_navigate, mcp__playwright__browser_snapshot, mcp__playwright__browser_click, mcp__playwright__browser_fill_form, mcp__playwright__browser_type, mcp__playwright__browser_press_key, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_evaluate, mcp__playwright__browser_console_messages, mcp__playwright__browser_network_requests, mcp__playwright__browser_wait_for, mcp__playwright__browser_resize, mcp__playwright__browser_close, mcp__playwright__browser_hover, mcp__playwright__browser_tabs, mcp__playwright__browser_select_option, mcp__playwright__browser_handle_dialog, Bash(lsof *), Bash(pgrep *), Bash(ps *), Bash(grim *), Bash(scrot *), Bash(xdotool *), Bash(import *), Bash(wmctrl *), Read, Edit
---

# Browser

Every browser interaction goes through this skill. If the task asks you to verify UI, debug playback, or hit any page in a real browser — invoke this skill first and stay inside it for the whole session.

**Browser engine: Google Chrome.** Playwright MCP is launched with `--browser=chrome` (configured globally in `~/.claude.json`), so all navigation goes through the user's installed Chrome — not a Playwright-bundled Chromium. Rationale: this matches the user's daily-driver and the Tauri shell's WebView feature surface more closely than the pristine Chromium binary. If a navigation fails with "browser not installed," confirm Chrome is on PATH (`which google-chrome` or `which chrome`); do not silently fall back to Chromium.

**Reading Seq logs/traces does NOT belong here.** Use the `seq` skill — its HTTP API is faster, cheaper, and returns parsable JSON. Only drive Seq in a browser if the user explicitly asks to see the live UI.

**Before verifying any code change, read `docs/architecture/Observability/04-Verification-Workflow.md`.** The short form: (1) decide which span/log line proves the change worked before opening the browser; (2) add any missing instrumentation first; (3) query Seq to confirm the expected signal — don't rely on "did the spinner disappear". Visual checks catch symptoms; traces catch invariant breaks.

## Self-update rule (read first, obey always)

When you discover a new Playwright quirk, a new page-specific gotcha, or a new interaction pattern during this task, **append it to the "Known Quirks" section of this file before finishing**. Future sessions rely on this; don't make them rediscover what you just learned. Use the `Edit` tool to append — do not rewrite the file.

## Screenshots

Save every screenshot to `.claude/screenshots/NN-descriptive-name.png` (project-root-relative). The `NN-` prefix is the step number for the current task — keeps screenshots ordered and greppable. Never write screenshots to the project root or anywhere else.

## Dev servers — identify the correct port before interacting

Multiple Rsbuild instances may be listening if a stale session was left running. The correct client is the one started by `bun run client` from workspace root on the configured port (`5173` by default).

```sh
lsof -i :5173   # expect rsbuild
lsof -i :5177   # stale instance — kill before proceeding
```

Always test at `http://localhost:5173`. Always confirm the server is up at `http://localhost:3002` before starting playback checks (`lsof -i :3002 | grep LISTEN`).

The **Tauri-embedded** Rust server picks a free `127.0.0.1:<port>` per-launch — find it via `pgrep -af xstream-tauri` then `lsof -p <pid>` to read the listening port, OR grep the dev log for `xstream-server listening`.

## Tauri-mode debugging

`bun run tauri:dev` opens a native desktop window — Playwright MCP **cannot** drive it directly. Tauri-on-Linux's webview is WebKit2GTK, which speaks the WebKit Inspector Protocol; Playwright speaks Chrome DevTools Protocol. The two are not interchangeable. The official end-to-end path (`tauri-driver` + WebDriver) is open work — see [`docs/architecture/Deployment/`](../../../docs/architecture/Deployment/README.md) for the deployment surface.

What the agent can do today:

| Goal | How |
|---|---|
| Verify the React UI / Rust backend behaviour | `browser_navigate http://localhost:5173/` while `bun run dev` runs. The same React/Relay client + Rust server are reachable from the browser at `:5173`; only the Tauri shell wrapper is missing. |
| Verify the Tauri-injected port specifically | Open DevTools in the Tauri window manually (right-click → Inspect — Tauri 2 dev mode enables this). Or check the dev log: `grep '__XSTREAM_SERVER_PORT__\|xstream-server listening' /tmp/tauri-dev.log`. |
| Visual evidence of the native window (layout, chrome) | Screenshot via `grim -t png .claude/screenshots/NN-tauri-window.png` (Wayland) or `scrot -u .claude/screenshots/NN-tauri-window.png` (X11). Then `Read` the file. |
| Verify the embedded server is reachable | `curl -sS http://127.0.0.1:<injected-port>/healthz` — port from the dev log. |
| Verify the origin selection logic | Read `client/src/config/rustOrigin.ts` — `TAURI_PORT !== null` selects the Tauri-injected loopback; otherwise dev falls back to `http://localhost:3002`. |

Heuristic: if the bug is in the React app or any GraphQL/stream resolver, drive `:5173` with browser MCP. If the bug is in the Tauri shell itself (port injection, native dialogs, window chrome, Tauri's `app.path()` usage, code-signed updates), screenshot the native window or wait for the `tauri-driver` follow-up.

```sh
# Snapshot the running Tauri window (X11)
WIN=$(xdotool search --name '^xstream$' | head -1)
import -window "$WIN" .claude/screenshots/01-tauri-main.png

# Snapshot on Wayland
grim .claude/screenshots/01-tauri-main.png

# Find the injected port
grep -oE 'xstream-server listening addr=127.0.0.1:[0-9]+' /tmp/tauri-dev.log | tail -1
```

## Playwright MCP cheatsheet

The Playwright tools operate on a single shared browser context — navigate once, then sequence interactions.

| Need | Tool | Notes |
|---|---|---|
| Open a page | `browser_navigate` | Use full URL; waits for load |
| See what's on the page | `browser_snapshot` | Returns accessibility tree + refs — prefer this over screenshots for DOM inspection |
| Click something | `browser_click` | Pass the ref from the snapshot |
| Fill one field | `browser_type` | Prefer `browser_fill_form` for multi-field forms |
| Run JS in page | `browser_evaluate` | For MSE state, Relay store, WS hook inspection |
| Wait for a state | `browser_wait_for` | Wait for text/selector to appear |
| Save visual evidence | `browser_take_screenshot` | Use when a verbal description is insufficient |
| Check console | `browser_console_messages` | Pull errors after an interaction |
| Inspect network | `browser_network_requests` | Useful for `/stream/`, `/graphql` traces |
| Close | `browser_close` | Call at end of task |

Start with `browser_snapshot` to find refs — don't guess selectors.

## Page-specific playbooks

### `http://localhost:5173` — xstream client

**Router state is not reset between routes with the same pattern.** Navigating `/player/:idA → /player/:idB` reuses the component — `useState` values persist. If an "ended" overlay shows on the new video or a detail pane shows previous-item data, that's the `docs/client/Debugging-Playbooks/00-Common-Issues.md` "React state persisting" playbook (not a bug of your test).

**DEV panel resets on navigation.** The stream-log overlay toggle in `DevToolsContext` is ephemeral UI state — it resets to off on every route change that remounts the context subtree. After navigating to `/player/:id`, re-open the DEV pill (bottom-right) and re-enable **"Stream Logs ON"** before starting playback. Without this, you'll capture a playback run with no stream events visible.

**Relay IDs are base64 and may contain `/`, `+`, `=`.** When constructing `/player/:videoId` URLs by hand, `encodeURIComponent(id)` first. A raw paste of an unencoded ID will break React Router's `:param` matching.

**Verifying WebSocket subscriptions.** Open DevTools → Network → WS → `/graphql` → Messages. `{"type":"connection_ack"}` should appear within 1s. Status 200 (instead of 101) means the upgrade handler is broken — see `docs/client/Debugging-Playbooks/00-Common-Issues.md` "GraphQL subscriptions not receiving events".

**Inspecting MSE / video state from Playwright:**
```js
// browser_evaluate body
const v = document.querySelector("video");
if (!v) return null;
return {
  readyState: v.readyState,
  networkState: v.networkState,
  error: v.error?.code,
  buffered: Array.from({ length: v.buffered.length }, (_, i) => ({
    start: v.buffered.start(i), end: v.buffered.end(i),
  })),
  currentTime: v.currentTime,
  paused: v.paused,
};
```

Back-buffer window should stay within ~5s behind `currentTime`; outside that, `BufferManager` eviction is broken.

### `https://www.omdbapi.com` — external metadata

For verifying an OMDb lookup result, hit the URL directly (no browser needed, `WebFetch` works). Use the browser only when the user wants to see the live web UI. Anchor URL: `https://www.omdbapi.com/?t=<title>&y=<year>&apikey=<key>`.

## WebSocket verification steps

When a subscription isn't delivering events:

1. `browser_snapshot` the client page while the subscription should be active.
2. `browser_network_requests` and filter for `/graphql` with status 101 — that's the WebSocket upgrade. If status is 200, the Rsbuild proxy or the axum upgrade handler is broken (see `docs/client/Debugging-Playbooks/00-Common-Issues.md`).
3. `browser_evaluate` the page for active subscriptions:
   ```js
   // Relay exposes __relayEnvironment in dev
   window.__relayEnvironment?.getStore()?.getSource()?.toJSON();
   ```
4. If `connection_ack` never arrives, the upgrade is failing silently; query the `seq` skill for `graphql-ws` errors on the server side.

## Known Quirks

*Appended by agents as they discover new patterns. Keep entries scoped — "this page does X", not essays.*

- **Client — stream-log overlay resets on navigation.** Documented under `localhost:5173` above. Re-enable in the DEV pill after each route change during playback tests.
- **Client — router reuse state bleed.** `/player/:a → /player/:b` does not remount. If state from `:a` appears during `:b`, the test is correct; the code needs a `useEffect` reset or `key={id}`.
- **Playwright MCP — snapshot is cheap, screenshot is not.** Use `browser_snapshot` to find refs; use `browser_take_screenshot` only when you need to show the user the pixels.
- **Spinner detection — use computed style, not class names.** Griffel generates atomic class names (e.g. `fn2ntg8`) that are not queryable by semantic name. To detect the spinner use `window.getComputedStyle(el).borderTopColor.includes('206')` and `animation.includes('linear')`. The loading overlay is `position:absolute, inset:0, z-index:5`; the spinner itself is 36×36px (45px rendered).
- **Seq auth — always use cookie from `.seq-credentials`.** `curl -b /tmp/seq-cookie.txt` after logging in with `POST /api/users/login`. The events endpoint returns an array of objects with `MessageTemplateTokens`, `Properties`, `Timestamp`, `Level` fields — not CLEF. Parse with `python3 -c "import json,sys; data=json.load(sys.stdin)"`.
- **Post-seek stuck-buffer bug (observed 2026-04-26).** Seeking via raw `v.currentTime = N` while the buffer pipeline is running can cause the SourceBuffer to accumulate 9GB+ of appended data with `v.buffered=[]` and `buffer_bytes=0` indefinitely. The video element stops firing all events (no seeking/seeked/timeupdate). This appears to be a bug where `bytesInBuffer` gets zeroed by repeated seek flushes. Use the controller's `seekTo()` method (via Nova SeekRequested event) rather than raw `v.currentTime` in tests to exercise the real seek path.
- **Seek bar is a custom `div[role="slider"]` not an `input[type=range]`** (observed 2026-04-26). The seek slider responds to `MouseEvent('click')` dispatched with `clientX` set to the desired pixel position. The handler calculates `fraction = (e.clientX - rect.left) / rect.width` then multiplies by duration. The click coordinates must be exact page coordinates (not viewport offset), matching what `getBoundingClientRect()` returns at call time.
- **OTel `span.addEvent()` is NOT visible as separate Seq log entries while the parent span is still open** (observed 2026-04-26). Events added via `sessionSpan.addEvent("playback.status_changed", ...)` are batched with the span and only exported to Seq when the span ends. For the long-lived `playback.session` span (which lives for the entire playback session), these events won't appear in Seq during a live session — they only show up after the span is closed. To verify status_changed/playing_event_skipped events, the session must be ended (navigate away) OR the trace must be inspected via console (the OTel DIR console logs show span objects in real-time).
- **Player controls auto-hide at opacity:0 — screenshot captures black screen** (observed 2026-04-26). The controls wrapper has `opacity: 0` after ~3s of inactivity. Real Playwright `browser_hover` triggers the opacity-1 reveal, but `browser_take_screenshot` happens after the hover completes so the mouse has already left. Workaround: call `page.evaluate` to set `parent.style.opacity='1'` + dispatch `mousemove` on the slider, then immediately take the screenshot in the same evaluate call frame using `requestAnimationFrame`. The accessibility tree `browser_snapshot` is reliable for tooltip text verification even when screenshot is black.
- **Seek slider `browser_hover` via ref only works when slider has a Playwright ref assigned** (observed 2026-04-26). Refs are not always assigned to `role=slider` elements in the snapshot. When the slider has no ref, use `browser_evaluate` with `slider.dispatchEvent(new MouseEvent('mousemove', {bubbles:true, clientX, clientY}))` — this triggers the React onMouseMove handler and the tooltip text appears in the accessibility tree on the next `browser_snapshot`.
- **Post-seek stuck-buffer: eviction_count grows 1:1 with segments_appended even when `?from=K` is wired** (observed 2026-04-26). The `?from=35` skip is applied to the first seek chunk only; subsequent continuation chunks (`[4200s,..)`, `[4500s,...)` etc.) are fetched without `?from=` and start from segment 0 on the server. But the stuck buffer (`buf=0MB / 0s, buffered_range_count=0`) persists across all post-seek chunks with eviction_count = segments_appended - constant, meaning the BufferManager's `remove()` call is firing after every single append. `v.buffered` returns empty despite successful MSE appends. This is a separate residual bug from the `?from=K` fix — the `seeking=true` state never clears and `v.buffered` stays empty indefinitely. `Seek ready` log never fires in this condition.
- **Post-seek stuck-buffer root signal: MediaSource in `ended` state, not `closed`** (observed 2026-04-26). The 345 "MediaSource not open — aborting append queue" WARN logs in the stuck trace ALL carry `ready_state: 'ended'` (not `closed`). This means `endOfStream()` was called on the MediaSource before the seek flush path could re-use it — sealing it permanently. No eviction and no QuotaExceeded fired because the append queue guard bails out before ever calling `appendBuffer()`. The buffer stays empty because no appends succeed, not because they are evicted.
- **Seq bulk query — use Python-side filter not URL `filter=` param for WARN level** (observed 2026-04-26). The Seq `/api/events?filter=Level%3D'WARN'` URL filter returns empty despite WARN events existing. Fetch `count=500` without a filter and apply level/message filtering in Python. The client-side OTel log level in Seq is `WARN` (uppercase), not `Warning` or `Warn`.
- **Seq trace data only lands after session span closes** (observed 2026-04-26). Client spans (including all log.warn inside the `playback.session` span) are only exported to Seq when the span ends — i.e., when the user navigates away. During a live stuck session the events are buffered in the OTel SDK. Query Seq AFTER navigating away, not during. The events arrive in Seq with timestamps from during playback but they are only queryable after navigation.
- **Stale cached segments invalidate edts-strip fix tests** (observed 2026-04-26). If a chunk job's segment directory exists on disk from a previous session (before `-output_ts_offset` was added to the ffmpegFile command), the segments have within-chunk-relative PTS (e.g. 158s) rather than absolute source-time PTS (4358s). Stripping the edts box from the init.mp4 has no effect in this case — the fix only helps when segments have correct absolute PTS (which only newly-transcoded chunks have). To test the edts-strip fix properly, clear the segment cache (`rm -rf tmp/segments/*`) and retranscode fresh, then seek.
- **Empty-edit elst vs PTS-shift elst** (observed 2026-04-26). ffmpeg writes an elst entry with `media_time=-1` (empty edit) for the initial silent period when `-output_ts_offset N` is used — NOT a `media_time=N` PTS-shift entry. Chromium MSE in `segments` mode ignores these empty edits for PTS placement and uses `tfdt` (baseMediaDecodeTime) from each moof directly. The edts/elst is therefore only harmful if Chromium uses it to compute a buffer-time adjustment; in practice the segments' own `tfdt` values are what MSE uses for placement. Always verify tfdt values in actual .m4s files (use `python3 -c "import struct; ..."` to decode moof/traf/tfdt) when diagnosing buffer placement bugs.
- **`init_sent` bytes_stripped=96 for chunk 0** (observed 2026-04-26). Even chunk 0 (no `-output_ts_offset`) has an edts box in its init.mp4 — a tiny empty edit (seg_duration=41 ticks, media_time=-1). This is normal ffmpeg muxer behavior unrelated to the seek-offset bug. `bytes_stripped=96` for all chunks (including chunk 0) is expected and correct.
- **`bytes_stripped=0` + `setTimestampOffset` is sufficient for cached pre-fix segments** (observed 2026-04-27). When the seek chunk's segments were cached before `-output_ts_offset` was added to ffmpeg, `bytes_stripped=0` in init_sent (no edts to strip) but the segments have within-chunk-relative tfdt (e.g. 156s for segment_0078 in a 4200s chunk). `BufferManager.setTimestampOffset(4200)` applied in `ChunkPipeline.processSegment` shifts MSE placement correctly to 4356s. The fix works even on cached stale segments — no cache wipe required. First post-seek `buffered_ranges_json` confirms `[[4356.14, 4368.15]]`.
- **Post-seek `MediaSource sourceended` is triggered by Chromium-internal CHUNK_DEMUXER_ERROR, not our endStream()** (observed 2026-04-27). When `sourceended fired` carries `stream_done: False`, it means Chromium internally called `endOfStream()` due to an append error — specifically `CHUNK_DEMUXER_ERROR_APPEND_FAILED: Failed to prepare video sample for decode`. This seals the MediaSource permanently. The `video element error event` (MEDIA_ERR_DECODE = 3) fires 16ms later confirming the async decoder error path. `MediaSource sourceclose fired` does NOT fire — the transition is `open → ended`, not `open → closed`. The sequence is: `Buffer flushed → (3.5s gap, first healthy segments buffer) → (2s gap, CHUNK_DEMUXER error triggers sourceended) → video error event → endless appendBuffer error loop`.
- **sourceended timing: 5.6s from Buffer flushed, NOT 3s gap before first data** (observed 2026-04-27). The 5.6s delta from `Buffer flushed` to `sourceended` comprises: ~3.5s until first healthy segments arrive (`buffered_ranges_json: [[2405,2417]]`), then ~2s of decode pipeline failure before Chromium seals. The "gap before segment 0" hypothesis is partially wrong — segments DO arrive successfully before the seal; the failure is during decode of those segments, not during the append stall.
- **DEV panel "Stream Logs ON" toggle does not exist in current codebase** (observed 2026-04-27). The playbook mentions re-enabling "Stream Logs ON" but this toggle was removed or never implemented in the current `DevPanel.tsx`. The DevTools panel only has the Kill-switch section. Stream events are captured via OTel → Seq. Skip the toggle step in future recipes.
- **Seq `Information`-level span events have empty `MessageTemplate` in this instance** (observed 2026-04-27). Server-side span events (init_sent, stream_started, transcode_started, job_started, etc.) are stored as `Level=Information` with `MessageTemplate=""` and all data in `Properties`. Filter by property content rather than `@MessageTemplate` for server-side span events. The span name appears as the `@MessageTemplate` only for span-end records (`Level=OK`). To find `init_sent`, query by `@Level='Information'` and check `Properties` for `bytes` field.
- **seek-time-anchored fix: seek chunk `chunk_start_s` is seekTime not grid snap** (observed 2026-04-27). After the `fix/playback-seek-spinner-pause` fix, `handleSeeking` passes `seekTime` (not `snapTime`) to `startChunkSeries`. Confirmed: seek to 4356.55s produced chunk `[4356.553651515152s, 4656.553651515152s)`, not `[4200s, 4500s)`. init_sent fires ~1.2s after seek; Seek ready fires ~4.4s after seek. No `-output_ts_offset`, no `?from=`, no `bytes_stripped`, no `from_index` in any seek-path event.
- **Stale playwright-mcp process holds Chrome profile lock** (observed 2026-04-27). If `browser_navigate` returns "Browser is already in use for … mcp-chrome-…, use --isolated", a stale `playwright-mcp` node process from a previous session is holding the Chrome user-data-dir lock. `ps aux | grep playwright-mcp` to identify the PID; `kill -9 <PID>` then retry navigation. Kill only the older process (lower PID / earlier start time), not the current session's process.
- **4K DV HEVC sources fail software encoding at non-zero seek positions** (observed 2026-04-27). Movies encoded as Dolby Vision HEVC (DV + HDR10) cause VAAPI to fail ("HW encode failed — retrying chunk with software") for seek-position chunks, and the software fallback with libx264 also produces near-zero output ("Chunk had no real content — marking stream done"). This is because libx264 cannot decode the DV layer — ffmpeg effectively produces only an init.mp4 with no real frame data. The `sourceended` that fires has `stream_done: True`, NOT a Chromium-internal CHUNK_DEMUXER error. To test the BSF fix on chunks that actually produce real content, use this source's chunk 0 (which VAAPI encodes successfully in ~14s, producing ~25 segments / 49s).
- **`MediaSource sourceended` with `stream_done: True` is legitimate, not a BSF failure** (observed 2026-04-27). When Seq shows `MediaSource sourceended fired` with `stream_done: True`, this is our own `endOfStream()` call triggered because the chunk pipeline determined the source had no real content. A CHUNK_DEMUXER_ERROR would show `stream_done: False`. In the BSF-fix verification session, ALL `sourceended` events had `stream_done: True` — confirming the BSF is preventing Chromium-internal decoder errors.
- **Seek slider `click` event does trigger seek path but MSE sealed at 49s clamps video.currentTime** (observed 2026-04-27). When `v.duration = 49` (MediaSource sealed by legitimate endOfStream after a short chunk), a `click` event on the seek slider fires the seek handler (confirmed by Seq: `Seek to 2402.6s → flushing buffer, requesting [2402.6, 2700)`) but `video.currentTime` does NOT advance to 2402 — it clamps to 49. The chunk is requested and transcoded but `current_time_s_at_arrival` stays at 49.05. The buffer rebuild path needs to succeed for the actual currentTime to update.
- **`flag.devForceShortChunkAtZero` forces 30s first chunk but chunk 0 VAAPI succeeds for Furiosa 4K** (observed 2026-04-28). The flag produces a (0→30s) first chunk for cold-start. Furiosa 4K DV HEVC encodes chunk 0 successfully in ~10–14s (15 segments). The silent failure only occurs on non-zero seek chunks for DV sources — chunk 0 is NOT affected. To reproduce `transcode_silent_failure` reliably, a seek to a mid-movie position must be issued on the Furiosa source while 4K is selected; the flag alone at cold-start is insufficient for Furiosa. Mad Max Fury Road (non-DV H.264) also cold-starts fine. The DB can retain stale silent-failure records (`total_segments=0, completed_segments=0, status=complete`) from prior sessions — delete them with `DELETE FROM transcode_jobs WHERE id='...'` and wipe `tmp/segments/<id>/` before re-testing.
- **Tauri-on-Linux uses WebKit2GTK; Playwright MCP cannot drive the native window** (observed 2026-05-01). Tauri's webview speaks the WebKit Inspector Protocol; Playwright MCP speaks the Chrome DevTools Protocol. There is no shim. The pragmatic path is to drive `http://localhost:5173/` while `bun run tauri:dev` runs — the React app + Rust backend are reachable, the Tauri shell wrapper is not. For Tauri-shell-specific verification (port injection, native menus, dialogs), screenshot the native window via `grim` (Wayland) / `scrot` / `xdotool` (X11), or wait for the `tauri-driver` follow-up subtask in Step 3.
- **`bun run tauri:dev` log lives at `/tmp/tauri-dev.log` by smoke-test convention** (observed 2026-05-01). The Step 3 smoke-test pattern launches dev mode as `nohup bun run tauri:dev > /tmp/tauri-dev.log 2>&1 &`. To find the injected port for a curl probe: `grep -oE 'xstream-server listening addr=127.0.0.1:[0-9]+' /tmp/tauri-dev.log | tail -1`. The port changes per launch (free-port pick at startup).
- **Tauri shell forces `HW_ACCEL=off` until probe softening lands** (observed 2026-05-01). `src-tauri/src/lib.rs` sets `HW_ACCEL=off` unless the env is already set. So in Tauri-mode, transcoding is software-only regardless of host VAAPI availability; this is a deliberate temporary stand-in for the deferred HW-accel probe softening. When debugging encode performance under Tauri, this is expected. To override for local testing: launch with `HW_ACCEL=vaapi bun run tauri:dev`.
- **Griffel hover animations only activate under real Playwright hover, not programmatic `mouseenter` dispatch** (observed 2026-05-01). Griffel-generated CSS uses `:hover` pseudo-class selectors; JavaScript `element.dispatchEvent(new MouseEvent('mouseenter'))` does not trigger them. To test hover-state computed styles, use `browser_hover` with the element ref, then immediately `browser_evaluate` to read `getComputedStyle`. This pattern correctly reveals breathing/keyframe animations on hover.
- **Scan button "Scanning…" state lasts ~2s — screenshots consistently miss it** (observed 2026-05-01). The `browser_click` → `browser_take_screenshot` round-trip is too slow (~500ms) to capture the mid-spin label. Use `browser_evaluate` with `btn.click(); await new Promise(r=>setTimeout(r,100)); return btn.textContent` to confirm the label change programmatically. The visual screenshot will always show the post-reset "Scan" label.
- **Griffel `outlineWidth: "0"` alone does NOT suppress Chrome's UA focus ring** (observed 2026-05-01). Griffel emits `outline-width: 0px` for `outlineWidth: "0"` but leaves `outline-style: auto` (the UA default for `:focus-visible`). Chromium renders the accent-colored focus ring even at width 0 when `outline-style` is `auto`. To fully suppress the ring, the Griffel style object must include `outlineStyle: "none"` (or equivalently the shorthand `outline: "none"`). Setting `outlineWidth` alone is insufficient.
- **SearchSlide Filter button is hidden by Results section z-index inversion** (observed 2026-05-03). When typing in the search bar, the SearchSlide renders with the "Filter" and "Clear" buttons at y~396 in viewport, but they are invisible and unclickable. Root cause: the parent `<div>` tree has SearchSlide (child 0) at y=-149 (off-screen above) and Results (child 1) at y=100.65 with `z-index:2`, inverting the stacking order. SearchSlide has `z-index:auto` (0), Results has `z-index:2`, so Results visually covers the lower portion of SearchSlide. Playwright's click fails with "img from Results subtree intercepts pointer events". Fix: adjust SearchSlide's top position or z-index so it stays above Results, or give Results a lower z-index than SearchSlide's intended stacking level.
