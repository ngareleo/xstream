---
name: browser
description: Drive a browser with Playwright MCP — navigate, click, fill, snapshot, inspect console, verify UI. Use whenever a task needs a real browser (verifying UI changes, debugging playback, checking OMDb responses). For reading Seq logs/traces use the `seq` skill (HTTP API) instead — only fall back to driving Seq in a browser if the user explicitly asks to see the live UI. The "Known Quirks" section is self-maintained — when a new page-specific gotcha is discovered this session, append it before finishing.
allowed-tools: mcp__playwright__browser_navigate, mcp__playwright__browser_snapshot, mcp__playwright__browser_click, mcp__playwright__browser_fill_form, mcp__playwright__browser_type, mcp__playwright__browser_press_key, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_evaluate, mcp__playwright__browser_console_messages, mcp__playwright__browser_network_requests, mcp__playwright__browser_wait_for, mcp__playwright__browser_resize, mcp__playwright__browser_close, mcp__playwright__browser_hover, mcp__playwright__browser_tabs, mcp__playwright__browser_select_option, mcp__playwright__browser_handle_dialog, Bash(lsof *), Read, Edit
---

# Browser

Every browser interaction goes through this skill. If the task asks you to verify UI, debug playback, or hit any page in a real browser — invoke this skill first and stay inside it for the whole session.

**Reading Seq logs/traces does NOT belong here.** Use the `seq` skill — its HTTP API is faster, cheaper, and returns parsable JSON. Only drive Seq in a browser if the user explicitly asks to see the live UI.

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
