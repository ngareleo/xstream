# Telemetry

xstream collects a small amount of anonymised telemetry from every install to help us debug issues, improve playback reliability, and prioritise the next things we build. This document is the canonical user-facing answer to "what does the app send, and where does it go?".

## What is collected

Every install sends:

- **Span data** describing playback sessions, transcode jobs, and library scans — durations, segment counts, buffer levels, kill reasons, hardware-acceleration mode in use.
- **Log records** describing state transitions and errors — "stream paused", "init segment sent", "ffprobe failed", with structured numeric attributes for filtering.
- **Process and platform context** — operating system family, app version, locale, hardware-acceleration capability flags.

Telemetry is **always on**. There is no in-app opt-out toggle. The reason that's defensible is the redaction guarantee below: the data we send has been engineered to be anonymous before it leaves your machine.

## What is **not** collected

xstream does **not** send:

- The contents of any video file.
- File names, paths, or directory layouts in raw form (paths are hashed before export — see "Redaction" below).
- Movie titles, show names, episode titles, OMDb queries, or any other library metadata that could identify what you're watching.
- Account credentials, watch history, search queries, or anything you type.
- IP-level identifiers beyond what every HTTPS request inherently exposes to the receiving server.

If you find a span or log attribute that violates this list, please file an issue at https://github.com/<owner>/xstream — that's a bug.

## Redaction

Before any span or log record leaves your machine for the production telemetry endpoint, a redaction layer in `server-rust/src/telemetry/redaction.rs` (Rust) and `client/src/telemetry/redaction.ts` (browser) scrubs identifying content:

- **File paths** (`path`, `library.path`, `file`, `directory`) are replaced with a SHA-256 hash truncated to 16 hex characters, salted with a per-process random nonce. The same path produces the same hash within one app run, so we can correlate "this hashed path failed twice in the same session" — but the hash is not reversible and changes every time the app restarts.
- **Movie titles, episode titles, show names, OMDb queries, and search queries** are stripped (replaced with empty strings) before export. We never see them.
- **Operationally useful identifiers** — internal job IDs, video IDs (random UUIDs assigned by the app), library names (the label, not the path), kill reasons, numeric durations and counts — pass through unchanged because none of them identify a user or a piece of content.

For the engineering policy this rule is implemented against, see [`../../architecture/Observability/01-Logging-Policy.md` § PII Redaction](../../architecture/Observability/01-Logging-Policy.md#pii-redaction).

## Where the data is sent

To a single dataset on [Axiom](https://axiom.co), a hosted OpenTelemetry backend. The OTel exporter inside the app posts directly to Axiom over HTTPS — no other third-party processor sits in front of it. The dataset is owned by us; only the small group of maintainers listed in the team has access to query it. The operational runbook lives at [`../../architecture/Deployment/04-Axiom-Production-Backend.md`](../../architecture/Deployment/04-Axiom-Production-Backend.md), and the engineering safeguards around the ingestion endpoint are documented at [`../../architecture/Deployment/05-Telemetry-Ingestion-Security.md`](../../architecture/Deployment/05-Telemetry-Ingestion-Security.md).

## How long it's kept

**30 days.** After that, telemetry events expire and are deleted by Axiom's built-in retention. We do not back up telemetry data — once it ages out, it is gone.

## In an offline app

If your machine has no network connection, telemetry is queued in memory and dropped when the app closes. There is no on-disk telemetry buffer — we deliberately keep telemetry ephemeral so an offline machine never accumulates a record on disk that could later be exfiltrated.

## Changes to this document

If we change what is collected, what is redacted, where it is sent, or how long it is kept, this document is updated and the change is called out in the release notes. The version of this document that ships with each release is the authoritative one for that release.

---

Last reviewed: 2026-05-07.
