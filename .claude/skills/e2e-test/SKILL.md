---
name: e2e-test
description: Run an end-to-end test of the xstream video streaming app using the Playwright MCP browser tools
disable-model-invocation: true
allowed-tools: Bash(bun *) Bash(lsof *) Bash(mkdir *) Bash(rm *)
---

You are running an end-to-end test of the xstream video streaming app using the Playwright MCP browser tools.

## Screenshots

All screenshots must be saved to `.claude/screenshots/` relative to the project root.
**Never** save screenshots to the project root or any other directory.
Before taking the first screenshot, ensure the directory exists:

```sh
mkdir -p .claude/screenshots
```

Use descriptive filenames prefixed with the step number, e.g. `.claude/screenshots/01-home.png`, `.claude/screenshots/04-library-created.png`.

Follow these steps exactly:

## 1. Start the dev servers

Before opening the browser, ensure both the server and client are running.

Check whether the server (port 3001) and client (port 5173) are already listening:

```sh
lsof -i :3001 -i :5173 | grep LISTEN
```

- If **both ports are already listening**, skip to step 2.
- If **neither is running**, start them with:
  ```sh
  bun run dev
  ```
  Run this command in the background from the project root. Wait 5 seconds, then re-check both ports are listening before continuing.
- If **only one port is missing**, start only the missing process:
  - Client only: `cd client && bun run dev` (background)
  - Server only: `cd server && bun run dev` (background)

Do not proceed until both ports show LISTEN.

## 2. Open the app

Navigate to http://localhost:5173. Take a screenshot. Verify the page loaded by checking for the main navigation or content area. If the page shows an error or blank screen, report it and stop.

## 3. Enable stream logs

Before navigating to a video:
- Click the **DEV** pill button fixed to the bottom-right corner of the screen to open the DevTools panel.
- Click the **"○ Stream Logs OFF"** button to toggle stream logging ON. It should now read **"● Stream Logs ON"**.
- Close the DevTools panel by clicking the DEV pill again (or clicking outside).

Take a screenshot confirming the stream log overlay is visible (it appears as a panel showing log entries or the "No entries yet" empty state).

## 4. Ensure a library exists

If the dashboard shows "No libraries have been added yet" or the library is empty:

1. **Ask the user** for the profile details using `AskUserQuestion` before touching the browser:
   - "No library found. What should the profile name be?" (suggest: `local`)
   - "What directory should it scan?"
2. Click **"+ New Profile"** (top-right of the dashboard) or **"CREATE LIBRARY"** button.
3. In the new profile form fill in the name and directory the user provided.
4. Submit the form to create the profile.
5. Wait for the library scan to complete (the scanning indicator disappears).
6. If the library is still empty after scanning (no video files found), report "No videos available to test" and stop.

## 5. Navigate to a video

From the current page (Dashboard or Library), find any video poster card or film title link and click it to open the detail pane or navigate to the player page. If you land on a detail pane with a "Play" or "Watch" button, click it to go to the player page. Take a screenshot confirming you are on a player page (URL contains `/player/`).

## 6. Start playback

Click the **Play** button (aria-label "Play") to begin playback. Take a screenshot after clicking. Wait up to 10 seconds for the loading spinner to disappear and video to start playing.

## 7. Let it play

Wait for **2 minutes** of playback. During this time, take a screenshot every 30 seconds to confirm:
- The video is still playing (the timestamp in the ControlBar is advancing).
- No red error overlay has appeared on the player.
- No error message is visible in the stream log panel.

## 8. Check the stream log for errors

After 2 minutes, take a screenshot of the stream log panel (scroll it if necessary to see the most recent entries). Look for any entries styled in red (error entries). 

Report the result:
- **PASS**: No error-styled entries in the stream log, video played continuously for 2 minutes.
- **FAIL**: List every error entry found (timestamp, category, message), describe what visual anomaly occurred (spinner stuck, error overlay, blank video), and include the relevant screenshot.

## Notes

- If the servers fail to start after the port check (fetch errors, blank page after starting), report the startup error output and stop.
- If the scanned directory is empty after scanning, report "No videos available to test".
- All screenshots go in `.claude/screenshots/` — never in the project root or elsewhere.
- The stream log panel is toggled from the DEV button → "Stream Logs" toggle. It appears as a floating overlay in the bottom portion of the screen.
- Error entries in the log are highlighted in red; normal entries are white/grey.
