You are running an end-to-end test of the tvke video streaming app using the Playwright MCP browser tools.

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
  Run this command in the background from the project root (`/home/dag/Projects/tvke`). Wait 5 seconds, then re-check both ports are listening before continuing.
- If **only one port is missing**, start only the missing process:
  - Client only: `cd client && bun run dev` (background)
  - Server only: `cd server && bun run dev` (background)

Do not proceed until both ports show LISTEN.

## 2. Open the app

Navigate to http://localhost:5173. Take a screenshot. Verify the page loaded by checking for the main navigation or content area. If the page shows an error or blank screen, report it and stop.

## 2. Enable stream logs

Before navigating to a video:
- Click the **DEV** pill button fixed to the bottom-right corner of the screen to open the DevTools panel.
- Click the **"○ Stream Logs OFF"** button to toggle stream logging ON. It should now read **"● Stream Logs ON"**.
- Close the DevTools panel by clicking the DEV pill again (or clicking outside).

Take a screenshot confirming the stream log overlay is visible (it appears as a panel showing log entries or the "No entries yet" empty state).

## 3. Navigate to a video

From the current page (Dashboard or Library), find any video poster card or film title link and click it to open the detail pane or navigate to the player page. If you land on a detail pane with a "Play" or "Watch" button, click it to go to the player page. Take a screenshot confirming you are on a player page (URL contains `/player/`).

## 4. Start playback

Click the **Play** button (aria-label "Play") to begin playback. Take a screenshot after clicking. Wait up to 10 seconds for the loading spinner to disappear and video to start playing.

## 5. Let it play

Wait for **2 minutes** of playback. During this time, take a screenshot every 30 seconds to confirm:
- The video is still playing (the timestamp in the ControlBar is advancing).
- No red error overlay has appeared on the player.
- No error message is visible in the stream log panel.

## 6. Check the stream log for errors

After 2 minutes, take a screenshot of the stream log panel (scroll it if necessary to see the most recent entries). Look for any entries styled in red (error entries). 

Report the result:
- **PASS**: No error-styled entries in the stream log, video played continuously for 2 minutes.
- **FAIL**: List every error entry found (timestamp, category, message), describe what visual anomaly occurred (spinner stuck, error overlay, blank video), and include the relevant screenshot.

## Notes

- If the servers fail to start after the port check (fetch errors, blank page after starting), report the startup error output and stop.
- If no videos are in the library (empty state), report "No videos available to test".
- The stream log panel is toggled from the DEV button → "Stream Logs" toggle. It appears as a floating overlay in the bottom portion of the screen.
- Error entries in the log are highlighted in red; normal entries are white/grey.
