---
name: debug-ui
description: Investigate visual bugs, interaction problems, and runtime errors in the React client. Use for UI-specific diagnosis (layout, rendering, component state). Delegates all browser mechanics to the `browser` skill.
allowed-tools: Bash(bun *)
---

# Debug UI

Use this skill when a UI bug needs investigation — layout, rendering, interaction, or runtime errors in the client.

## Delegate browser interaction to the `browser` skill

Every real-browser action (navigate, snapshot, click, screenshot, evaluate, console inspection, network-request inspection) goes through the `browser` skill. Do not reinvent Playwright invocations here — the `browser` skill owns the Playwright MCP tools, the dev-server-port rule, the screenshot convention, and the per-page quirks (router reuse, DEV panel reset, Seq login).

This skill adds the **diagnosis strategy** on top of that: what to look for, which DOM/state to inspect, which client-side playbook matches.

## Diagnosis strategy

1. **Reproduce with the `browser` skill.** Navigate to the affected page and interact until the bug shows.
2. **Snapshot DOM state.** Prefer `browser_snapshot` over raw screenshots — the accessibility tree tells you what the component is rendering.
3. **Check console + network.** `browser_console_messages` for render errors; `browser_network_requests` for failed `/graphql` or `/stream/` requests.
4. **Inspect client-side state** via `browser_evaluate`:
   - MSE / video state: `document.querySelector("video")` → `readyState`, `buffered`, `error`
   - Relay store: `window.__relayEnvironment?.getStore()?.getSource()?.toJSON()`
5. **Match to a known playbook.** See `docs/client/Debugging-Playbooks/00-Common-Issues.md` — most client bugs map to one of: subscription not firing, scan not refreshing, Relay query disposal, React state persisting across routes, Griffel type error, hook ordering, stream-log overlay reset.
6. **Fix in code.** If the fix is a component pattern, delegate to the `write-component` skill.

## Storybook-based debugging

Isolate a component out of the real page to reproduce a rendering bug:

```bash
cd client && bun run storybook
# http://localhost:6006
```

- **Accessibility** panel → a11y violations
- **Actions** panel → event handlers
- **Controls** panel → prop edge cases

If you can't reproduce the bug in Storybook, the bug is in the surrounding data/context, not the component.
