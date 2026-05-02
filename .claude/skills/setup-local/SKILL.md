---
name: setup-local
description: Full local environment setup — install deps, generate Seq credentials, start Seq and dev servers
disable-model-invocation: true
allowed-tools: Bash(bash *) Bash(bun *) Bash(lsof *) Bash(grep *) Bash(cat *) Bash(cp *) Bash(realpath *) Bash(sed *) Bash(printf *) Bash(test *) Bash(ls *)
---

You are setting up a fresh local development environment for xstream. Follow these steps in order.

## Screenshots

All screenshots must be saved to `.claude/screenshots/` relative to the project root.
Use descriptive filenames, e.g. `.claude/screenshots/setup-01-app-running.png`.

## 1. Install dependencies

Run the install script from the project root:

```sh
bash install.sh
```

This installs Bun if missing, runs `bun install`, creates `tmp/segments-rust/`, and generates Relay artifacts.

If it fails, report the error output and stop.

## 2. Install the pinned ffmpeg

`scripts/ffmpeg-manifest.json` pins one exact jellyfin-ffmpeg version with per-platform SHA256. Install it:

```sh
bun run setup-ffmpeg
```

Platform behaviour:
- **All platforms**: downloads the portable jellyfin-ffmpeg archive, verifies SHA256, extracts to `vendor/ffmpeg/<platform>/`. No sudo. The Tauri build later restages this into `src-tauri/resources/ffmpeg/<platform>/` via `bun run setup-ffmpeg --target=tauri-bundle`.

The server refuses to start unless `ffmpeg -version` matches the pinned `versionString` exactly. If it doesn't, `bun run setup-ffmpeg --force` re-installs.

## 3. Set up Seq (log management)

Check if Seq is already running:

```sh
lsof -i :5341 | grep LISTEN
```

- **If Seq is already running**: check that `.seq-credentials` exists at the project root.
  - If it exists, you are good — skip to step 3.
  - If it does **not** exist, the container was created before this setup flow. Inform the user:
    > Seq is running but `.seq-credentials` is missing. To fix: run `bun run seq:stop`, then `docker rm seq`, then `bun run seq:start`. This will regenerate credentials and recreate the container.
    Stop here.

- **If Seq is not running**: start it (this also generates `.seq-credentials` on first run):

```sh
bun run seq:start
```

Wait for the script to complete, then verify `.seq-credentials` was created:

```sh
cat .seq-credentials
```

Report the username and that a password was generated (do NOT print the password in your response).

**First-login password change:** On a fresh Seq container, the first login at `http://localhost:5341` will require a password change. Choose a new password (Seq rejects reusing the initial one), complete the login, then immediately update `.seq-credentials`:

```sh
printf 'SEQ_ADMIN_USERNAME=admin\nSEQ_ADMIN_PASSWORD=<new-password>\n' > .seq-credentials
```

## 4. Set up environment variables

Check if `.env` exists:

```sh
cat .env 2>/dev/null || echo "MISSING"
```

If missing, copy from the example:

```sh
cp .env.example .env
```

Report that `.env` was created from `.env.example` and that OMDB_API_KEY and OTEL_EXPORTER_OTLP_HEADERS may need to be filled in.

## 4b. Configure the encode-test fixtures directory

The chunker encode tests (`bun test`) run real ffmpeg encodes against a couple of source movies on disk. Wiring this up is optional — leave unset and the tests skip cleanly — but skipping it means a regression in the HW-encode pipeline won't be caught locally.

Ask the developer (verbatim):

> The chunker encode tests run real ffmpeg encodes against your local copies of these movies:
>
>   • Mad Max- Fury Road (2015).mkv
>   • Furiosa- A Mad Max Saga (2024) 4K.mkv
>
> Path to a directory containing them? (Press Enter to skip — encode tests will be skipped.)
>
> Tip: if your local filenames differ, create a directory of symlinks pointing at your real files using these basenames.

If they provide a path:

1. Resolve it to absolute (`realpath`).
2. Confirm the directory exists. If not, report and skip the write.
3. List which expected basenames are present and which are missing.
4. If at least one is present, write `XSTREAM_TEST_MEDIA_DIR=<absolute>` to `.env`. Use this idempotent pattern (replaces an existing line, otherwise appends):
   ```sh
   ABS=$(realpath "<user-input>")
   if grep -q '^XSTREAM_TEST_MEDIA_DIR=' .env 2>/dev/null; then
     sed -i.bak "s|^XSTREAM_TEST_MEDIA_DIR=.*|XSTREAM_TEST_MEDIA_DIR=$ABS|" .env && rm -f .env.bak
   else
     printf 'XSTREAM_TEST_MEDIA_DIR=%s\n' "$ABS" >> .env
   fi
   ```
5. If zero expected basenames are present, do NOT write — report the mismatch and recommend symlinking.

If they skip (empty input):

- Print: "Skipped — to enable later, set `XSTREAM_TEST_MEDIA_DIR` in `.env` and re-run `/setup-local`, or run with `XSTREAM_TEST_MEDIA_DIR=<dir> bun test` ad-hoc."

## 5. Check environment configuration

```sh
bun run check-env
```

Report any variables shown as missing or misconfigured. Do not block on warnings — only stop if a required variable is missing. The "Test fixtures (dev)" section will list each expected fixture as ✔ or missing, based on whatever you wrote in step 4b.

## 6. Start dev servers

Check if they are already running:

```sh
lsof -i :3002 -i :5173 | grep LISTEN
```

If neither is running, start them:

```sh
bun run dev
```

Run in background and wait up to 15 seconds for both ports to become LISTEN. Re-check with `lsof -i :3002 -i :5173 | grep LISTEN`.

If either port is still not listening after 15 seconds, report a startup failure.

## 7. Verify the app loads

Navigate to `http://localhost:5173` in the browser. Take a screenshot.

Confirm the main navigation or dashboard is visible. If the page shows an error or is blank, report it.

## 8. Print setup summary

Report:
- ✓ Dependencies installed
- ✓ ffmpeg + ffprobe present at `vendor/ffmpeg/<platform>/`
- ✓ Seq running at http://localhost:5341 (credentials in `.seq-credentials`)
- ✓ `.env` present
- ✓ Dev servers running (server :3002, client :5173)
- ✓ App accessible at http://localhost:5173
- Encode-test fixtures: ✓ wired (`XSTREAM_TEST_MEDIA_DIR=...`) **or** ⚠ skipped — re-run setup or set the var manually to enable
- Any items that need manual attention (e.g. OMDB_API_KEY, Seq API key for OTLP)

## Notes

- `.seq-credentials` is gitignored — it is local to this machine. Run `cat .seq-credentials` to see the Seq admin password.
- To verify OTel logs are reaching Seq after a playback session, run the `/otel-logs` skill.
- To reset everything: `bun run stop && bun run seq:stop && bun run clean:db`
