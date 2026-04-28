# Step 4 — Release Plumbing + First Beta

## Where this step sits

Final step before first beta. Predecessor: [Step 3 — Tauri Packaging](03-Tauri-Packaging.md) — a Tauri-bundled binary that runs locally on at least one OS. Successor: peer-to-peer sharing (out of scope for v1; spec at [`../../../architecture/Sharing/00-Peer-Streaming.md`](../../../architecture/Sharing/00-Peer-Streaming.md)).

At the end of this step there is a **signed, auto-updating beta** distributed to a soak group. The bar is "users can install it, run it, get updates, and report issues that come back as actionable telemetry." Stable channel comes later, after the soak group reports.

## Scope

**In:**

- **Per-OS code signing.**
  - macOS: Apple Developer ID Application cert + `notarytool` notarization. Hardened runtime + entitlements as needed.
  - Windows: Authenticode cert (OV is fine; EV avoids SmartScreen warm-up). `signtool sign /tr <ts> /td sha256 /fd sha256`.
  - Linux: AppImage signed via GPG / Ed25519; `.deb` / `.rpm` signed for repo distribution.
- **Auto-update.** `tauri-plugin-updater` with Ed25519-signed JSON manifests on a static origin (S3 / R2 / GitHub Releases). Per-OS payload formats: `.app.tar.gz` / `.msi` / `.AppImage`. Detail in [`../08-Tauri-Packaging.md`](../08-Tauri-Packaging.md).
- **CI release matrix.** New file `.github/workflows/release.yml` triggered on tag push (`v*.*.*`). Native runner per OS — no cross-compile. Per-job sequence: checkout → build server + client → setup-ffmpeg → `tauri build --target <triple>` → sign → upload artifact → publish updater manifest. The existing `ci.yml` stays as the per-PR validation pipeline.
- **First beta channel.** `beta` manifest URL. Soak group enrolled out-of-band (download link + first-run instructions).
- **Telemetry path for beta users.** Either a hosted OTLP collector with user consent at first run, OR opt-in via Settings. Decision must be locked before this step ships (Step 3's day-one decision #5).
- **Release-tagging convention.** SemVer + a `version` field in the relevant `package.json` / `Cargo.toml` files (none exist today). Tag → manifest → updater is the source-of-truth chain.

**Out:**

- **Peer sharing.** Forward-constrained but not shipped in v1. Spec at [`../../../architecture/Sharing/00-Peer-Streaming.md`](../../../architecture/Sharing/00-Peer-Streaming.md).
- **UI redesign.** Tracked outside this playbook.
- **Stable channel.** Beta only at first; stable graduates after the soak group reports clean.
- **Third-party app stores.** Distribution is direct from a static origin / GitHub Releases. No App Store, no Microsoft Store, no Snap Store in v1.

## Stable contracts to preserve

For Step 4 the relevant contracts are not protocol-level but **distribution-level**:

- **Updater manifest schema** — Ed25519-signed JSON, per [`../08-Tauri-Packaging.md`](../08-Tauri-Packaging.md). Once a beta user has installed v0.1.0, they cannot be migrated to a different updater shape without a fresh install. Pick the manifest layout once and don't churn it.
- **Bundle layout** — `vendor/ffmpeg/<platform>/ffmpeg`, identity DB in `app_data_dir()`, segment cache in `app_cache_dir()`. Detail in [Step 3](03-Tauri-Packaging.md).
- **Signing key custody** — Ed25519 private key (Tauri updater) and Authenticode / Apple certs are *load-bearing*. A lost key invalidates the entire update channel. Custody decision belongs in this step.

## Cutover mechanism

N/A.

## Pointers to layer references

- [`../08-Tauri-Packaging.md`](../08-Tauri-Packaging.md) — primary. Updater contract, bundle layout, code-signing per OS, CI matrix shape.
- [`../../../architecture/Deployment/00-Interim-Desktop-Shell.md`](../../../architecture/Deployment/00-Interim-Desktop-Shell.md) — §5 (distribution across OSes), §6 (auto-update story per shell), §7 (CI integration). The interim Electron alpha covers most of the same per-OS surface area at the *signing keys + CI matrix shape + updater shape* level. Reuse the decisions, not the shell.

## Lessons-feed-in from the Interim Electron alpha

The interim alpha exists specifically to surface release-plumbing surprises early. By the time Step 4 starts, expect to inherit:

- **Signing keys** already provisioned (1Password Secrets Automation → GH Actions). Don't re-procure; reuse.
- **CI release matrix** (mac arm64 + x64, win x64 + arm64, linux x64 + arm64) already exercised on tag push. Step 4 swaps the bundler step (Electron-builder → `tauri build`); everything else carries over.
- **OS-level caveats** validated in real installs: macOS notarization timing, Windows SmartScreen warm-up, Linux AppImage signature-verification tooling. The interim alpha is where these hit first.
- **Library-picker UX** validated in user hands — Step 3 inherits the UX patterns.
- **VAAPI probe softening** validated on Linux user machines.
- **OTel endpoint strategy** validated (hosted collector vs. off-by-default). The interim alpha forces this decision, Step 4 finalizes it.

## Sharing forward-constraints to honour

None new at the release-plumbing layer. The constraints baked in during Steps 1 & 2 (per-connection pull isolation, content-addressed cache, two-DB split, traceparent on the wire) are what enable peer sharing to be added later without re-cutting the release flow.

## Decisions to lock before starting

1. **Signing-key custody.** Where the Ed25519 / Authenticode / Apple Developer ID private keys live. Recommend 1Password Secrets Automation → GH Actions secret, with a documented rotation runbook. Decision must be made before the first signed bundle ships.
2. **Static-origin host for updater manifests + payloads.** S3 / R2 / GitHub Releases. GitHub Releases is the fastest path; R2 is cheaper at scale. Pick one, document the path convention.
3. **Update channel naming.** Recommend `stable` and `beta` only at first; defer `nightly` / `canary` until there's a real ask.
4. **Soak group definition.** Who, how many, how they enrol, how they report issues. Without this, "first beta" has no destination.
5. **Telemetry posture for beta users.** This is the last chance to lock Step 3 decision #5. Off-by-default + Settings opt-in is the conservative pick; hosted collector with first-run consent is the data-rich pick. Pick one.
6. **Release cadence.** Tag-on-push vs. tag-on-schedule. Recommend tag-on-push for beta; switch to a cadence for stable.
7. **Rollback story.** Updater rollback isn't built in to `tauri-plugin-updater`. Decide what "we shipped a bad beta" looks like — reinstall an older signed bundle, or a fast-follow patch release. Document so the on-call playbook isn't invented during an incident.
