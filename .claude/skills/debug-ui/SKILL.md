---
name: debug-ui
description: Interact with the React client using Playwright — feature verification, visual testing, playback checks, debugging layout or interaction problems, and inspecting runtime errors.
allowed-tools: Bash(bun *)
---

# Debug UI with Playwright

Use Playwright to investigate visual bugs, interaction problems, and runtime errors in the client.

## Prerequisites

The dev server must be running:
```bash
# Terminal 1 — server
cd server && bun run dev

# Terminal 2 — client
cd client && bun run dev
```

Client is available at `http://localhost:5173` by default.

## Quick checks

```bash
# Open browser and navigate to a page
cd client && npx playwright open http://localhost:5173

# Run all Playwright tests
cd client && npx playwright test

# Run with UI mode (interactive)
cd client && npx playwright test --ui

# Run headed (see the browser)
cd client && npx playwright test --headed
```

## Common debugging patterns

### Capture a screenshot of a specific page
```typescript
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
await page.goto("http://localhost:5173/play/VIDEO_ID");
await page.screenshot({ path: "debug.png", fullPage: true });
await browser.close();
```

### Inspect console errors
```typescript
page.on("console", (msg) => {
  if (msg.type() === "error") console.log("Console error:", msg.text());
});
page.on("pageerror", (err) => console.log("Page error:", err.message));
```

### Check MSE / video state
```typescript
const videoState = await page.evaluate(() => {
  const video = document.querySelector("video");
  if (!video) return null;
  return {
    readyState: video.readyState,
    networkState: video.networkState,
    error: video.error?.code,
    buffered: Array.from({ length: video.buffered.length }, (_, i) => ({
      start: video.buffered.start(i),
      end: video.buffered.end(i),
    })),
    currentTime: video.currentTime,
    paused: video.paused,
  };
});
```

### Intercept network requests
```typescript
// Monitor /stream/ requests
page.on("request", (req) => {
  if (req.url().includes("/stream/")) console.log("Stream request:", req.url());
});
page.on("response", (res) => {
  if (res.url().includes("/stream/")) console.log("Stream response:", res.status());
});
```

### Check Relay store state
```typescript
// Relay exposes its store in dev mode via __relayEnvironment
const storeState = await page.evaluate(() => {
  return (window as any).__relayEnvironment?.getStore()?.getSource()?.toJSON();
});
```

## Storybook component debugging

```bash
cd client && bun run storybook
# Navigate to http://localhost:6006
```

- Use the **Accessibility** panel to check a11y violations
- Use the **Actions** panel to verify event handlers fire
- Use the **Controls** panel to test edge-case prop values

## Debugging WebSocket / subscription issues

```typescript
// Intercept WS messages
const wsMessages: string[] = [];
page.on("websocket", (ws) => {
  ws.on("framesent", (frame) => wsMessages.push(`SENT: ${frame.payload}`));
  ws.on("framereceived", (frame) => wsMessages.push(`RECV: ${frame.payload}`));
  ws.on("close", () => wsMessages.push("WS CLOSED"));
});
```

## Checking for memory leaks (SourceBuffer growth)

```typescript
// Poll the buffered range while video plays
for (let i = 0; i < 10; i++) {
  const state = await page.evaluate(() => {
    const v = document.querySelector("video")!;
    const buf = v.buffered;
    return buf.length > 0 ? { start: buf.start(0), end: buf.end(0) } : null;
  });
  console.log(`t=${i * 5}s →`, state);
  await page.waitForTimeout(5000);
}
```

The back buffer window should stay within ~5 seconds behind `currentTime`.
