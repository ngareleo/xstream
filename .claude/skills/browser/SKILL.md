---
name: browser
description: Drive a browser with Playwright MCP — navigate, click, fill, snapshot, inspect console, verify UI. Use whenever a task needs a real browser (verifying UI changes, debugging playback, checking OMDb responses). For reading Seq logs/traces use the `seq` skill (HTTP API) instead — only fall back to driving Seq in a browser if the user explicitly asks to see the live UI. The "Known Quirks" section is self-maintained — when a new page-specific gotcha is discovered this session, append it before finishing.
allowed-tools: mcp__playwright__browser_navigate, mcp__playwright__browser_snapshot, mcp__playwright__browser_click, mcp__playwright__browser_fill_form, mcp__playwright__browser_type, mcp__playwright__browser_press_key, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_evaluate, mcp__playwright__browser_console_messages, mcp__playwright__browser_network_requests, mcp__playwright__browser_wait_for, mcp__playwright__browser_resize, mcp__playwright__browser_close, mcp__playwright__browser_hover, mcp__playwright__browser_tabs, mcp__playwright__browser_select_option, mcp__playwright__browser_handle_dialog, Bash(lsof *), Read, Edit
---

# Browser

Every browser interaction goes through this skill. If the task asks you to verify UI, debug playback, or hit any page in a real browser — invoke this skill first and stay inside it for the whole session.

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

Always test at `http://localhost:5173`. Always confirm the server is up at `http://localhost:3001` before starting playback checks (`lsof -i :3001 | grep LISTEN`).

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
2. `browser_network_requests` and filter for `/graphql` with status 101 — that's the WebSocket upgrade. If status is 200, the Rsbuild proxy or `Bun.serve` upgrade handler is broken (see `docs/client/Debugging-Playbooks/00-Common-Issues.md`).
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
