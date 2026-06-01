# Identity — System Overview

## Why Supabase

xstream is a Tauri desktop app. The alpha needed a real identity signal — every OTel event the
app emits should be attributable to a user so we can investigate user-specific sessions in
Seq/Axiom. Supabase fits because:

- Hosted password auth, no infra to operate.
- Asymmetric (RS256) JWTs — the server can verify the user's credential *once* at session-issue
  time using only the public JWKS endpoint (no shared secret ships in the bundle).
- The anon key + project URL are explicitly designed to be public; RLS on Supabase guards data.
  (We currently store nothing in Supabase beyond the auth-users table.)

We did not consider self-hosted auth (Keycloak, Authelia) because it would add an operational
service the team would have to run for every alpha tester.

## Local session model (current)

After a successful Supabase login the Rust service **issues its own local session token**:

- **Algorithm:** HS256, signed with a per-install secret generated and persisted in
  `user_settings.localSessionSecret` (see below).
- **Lifetime:** absolute ~30-day TTL. No sliding refresh.
- **Revocable:** a `sessions` table row tracks `jti / revoked_at`; logout sets `revoked_at`.
- **Offline-valid:** signature + `exp` check requires no network; revocation check is a local
  SQLite lookup.

This supersedes the earlier "verify Supabase JWT per request + soft-fail on expiry + client
localStorage fallback" model. Supabase JWTs are now consumed once at `/auth/session` issue
time and not carried per-request.

## In-process server framing

The Rust server runs **as a tokio task in the same OS process** as the Tauri webview
(`docs/SUMMARY.md`). The webview talks to it over HTTP on a free `127.0.0.1` loopback port
chosen at startup. Both halves live under the user's own process.

That changes the threat model in two ways:

1. **Auth is for identity correlation, not access control.** A user already controls every byte
   of their own machine. Server-side token verification doesn't keep a hostile user out of
   their own server; it just gives the server a verified `user.id` to stamp on telemetry.
   Gating GraphQL resolvers behind auth is therefore cosmetic in alpha and we don't do it.
2. **No network-trust assumption.** Because the token travels over loopback inside one process,
   we don't need TLS for the local hop. We still verify the signature so that a tampered
   webview JS bundle can't trivially spoof an arbitrary `user.id` to confuse our own telemetry.

Forward gate: when peer sharing lands (`docs/architecture/Sharing/`), the same `RequestContext`
already carries `peer_node_id` and `share_grant` placeholders. Authorization for remote peers
will layer on top — the auth middleware populates `user_id` independently from any future
peer-grant middleware.

## What ships in the bundle

| Value | Where | Why it's safe |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | client build-time env | Public by design — every Supabase client embeds it. |
| `PUBLIC_SUPABASE_ANON_KEY` | client build-time env | Public by design; capabilities scoped by Supabase RLS. |
| `SUPABASE_JWKS_URL` | server runtime env | Public endpoint (`https://<project>.supabase.co/.well-known/jwks.json`). |

What **must not** ship:

- Supabase **service-role key** — would bypass RLS on the whole project. Alpha doesn't need it.
- The **per-install HS256 secret** — this lives in `user_settings` on the user's own machine and
  is never transmitted or bundled. It is generated once at first boot.
- Any static HS256 secret — the design relies on the secret being per-install and runtime-generated.
- **SMTP creds** — Supabase sends mail; we never touch SMTP.

Full threat model: [`docs/architecture/Deployment/07-Supabase-Identity-Security.md`](../Deployment/07-Supabase-Identity-Security.md).

## Alpha vs. forward gates

**Alpha (this release):**

- Sign in / sign up / reset / change password / sign out.
- Client POSTs Supabase token to `POST /auth/session` once; server verifies online, mints a
  local session (HS256, ~30-day TTL), stores a `sessions` row.
- Per-request: server verifies local token offline (HS256 + `exp`) and confirms not revoked
  via `db::is_session_active`, stamps `user.id` on the request span.
- Client restores `userContext` offline at boot from the stored token's `exp`.
- Explicit logout POSTs to `POST /auth/logout` which sets `revoked_at` — immediate revocation.
- No GraphQL resolver gates on identity; everything is still readable by an unauthenticated
  request (though the UI guards routes).
- WS subscription `connection_init` auth is **not** implemented — see
  [`02-Session-And-Refresh.md`](02-Session-And-Refresh.md) §Known gaps.

**Beyond alpha:**

- Resolver-level authorization once peer sharing lands.
- `user_id` foreign keys on local SQLite tables (watchlist owners, playback history) — today
  they're keyless.
- WS subscription auth (requires resolving the axum 0.7/0.8 split in async-graphql-axum).
- Shorter Supabase JWT TTL is fine (and recommended) — the local session now owns the 30-day
  lifetime. No operator action required to change this for alpha; the defaults work.
