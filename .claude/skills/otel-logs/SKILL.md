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

## 5. Report result

- **PASS**: At least one log entry from `xstream-server` is visible in the events list. Report how many entries are shown and the timestamp of the most recent one.
- **FAIL**: No entries visible after filtering, or login failed. Include the relevant screenshots and describe what was shown.

## Notes

- Seq may show a short delay (up to 10 seconds) between log emission and UI visibility due to the OTel `BatchLogRecordProcessor` flush interval.
- If no events appear, trigger some server activity first: navigate to the player page and start playback, then wait ~10 seconds and check again.
- The `service.name` attribute is set to `xstream-server` in `server/src/telemetry.ts`.
