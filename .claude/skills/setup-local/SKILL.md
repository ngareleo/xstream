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

## 4. Set up secrets via Doppler

xstream uses **Doppler** as the canonical source for dev secrets. Log in and configure your local environment:

```sh
doppler login
```

Follow the browser flow to authenticate your Doppler account (same account as the team password manager).

Once authenticated, configure the project and config:

```sh
doppler setup --project xstream --config dev
```

This writes a `.doppler.yaml` at the project root so all subsequent `doppler run --` invocations use the correct project and config.

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
4. If at least one is present, set it in Doppler's `dev_personal` config:
   ```sh
   ABS=$(realpath "<user-input>")
   doppler secrets set XSTREAM_TEST_MEDIA_DIR "$ABS" --config dev_personal
   ```
   (Or set it ad-hoc at test time: `XSTREAM_TEST_MEDIA_DIR=<dir> doppler run -- bun test`, if the user prefers one-off use.)
5. If zero expected basenames are present, do NOT write — report the mismatch and recommend symlinking.

If they skip (empty input):

- Print: "Skipped — to enable later, set `XSTREAM_TEST_MEDIA_DIR` in Doppler's `dev_personal` config and re-run `/setup-local`, or run with `XSTREAM_TEST_MEDIA_DIR=<dir> doppler run -- bun test` ad-hoc."

## 5. Dev servers are ready

All secrets are now injected by `doppler run --` from the shared `dev` config. No env-var checking step is needed.

To start dev servers:

```sh
doppler run -- bun run dev
```

The shared `dev` config provides `OMDB_API_KEY`, telemetry tokens (`*_AXIOM_*`), and all other dev secrets. The `dev_personal` config is optional and only needed if `XSTREAM_TEST_MEDIA_DIR` was set in step 4b.

## 6. Start dev servers

Check if they are already running:

```sh
lsof -i :3002 -i :5173 | grep LISTEN
```

If neither is running, start them:

```sh
doppler run -- bun run dev
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
- ✓ Doppler authenticated and configured (`doppler setup --project xstream --config dev`)
- ✓ Dev servers running (server :3002, client :5173) via `doppler run -- bun run dev`
- ✓ App accessible at http://localhost:5173
- Encode-test fixtures: ✓ wired (`XSTREAM_TEST_MEDIA_DIR` in Doppler `dev_personal` config) **or** ⚠ skipped — set manually to enable
- Secrets injected from Doppler `dev` config (OMDB_API_KEY, telemetry tokens, etc.)

## Notes

- `.seq-credentials` is gitignored — it is local to this machine. Run `cat .seq-credentials` to see the Seq admin password.
- Doppler `.doppler.yaml` is gitignored and local to your machine.
- All dev env vars now come from Doppler via `doppler run --`; there is no `.env` file.
- To verify OTel logs are reaching Seq after a playback session, run the `/otel-logs` skill.
- To reset everything: `bun run stop && bun run seq:stop && bun run clean:db` (no `.env` to clean up)
