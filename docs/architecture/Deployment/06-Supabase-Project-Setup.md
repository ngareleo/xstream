# Supabase Project Setup

Prerequisite runbook for the operator who provisions xstream's identity backend. Pair with [`07-Supabase-Identity-Security.md`](07-Supabase-Identity-Security.md) (threat model) and [`docs/architecture/Identity/`](../Identity/README.md) (architecture).

## 1. Create the project

1. Go to <https://supabase.com/dashboard> and create a new project.
2. Pick a region close to the user base (latency on the JWT issuance round-trip matters at signin).
3. Save the project ref — it appears in every URL below as `<ref>`.

## 2. Configure auth providers

**Authentication → Providers → Email:**

- Enable.
- **"Confirm email" → OFF** for alpha. Auto-confirm means signup returns a live session immediately and we avoid wiring an email-confirmation landing route. Flip on later when stakes rise.

## 3. Enable asymmetric JWT signing

**Authentication → JWT Signing Keys:**

- Rotate to **asymmetric (RS256)**. Supabase GA'd this in 2025; it's the recommended posture for client-distributed apps because the server holds only the public JWKS — no shared secret in the bundle.
- Note the JWKS URL: `https://<ref>.supabase.co/.well-known/jwks.json`. This is `SUPABASE_JWKS_URL`.

If your project doesn't expose asymmetric keys (region / plan limitation), see [`07-Supabase-Identity-Security.md`](07-Supabase-Identity-Security.md) §HS256 fallback — but the asymmetric path is strongly preferred.

## 4. Configure redirect URLs

**Authentication → URL Configuration → Redirect URLs:** allowlist

- `tauri://localhost` — production Tauri scheme.
- `http://localhost:5173` — Rsbuild dev server.

These are used by the magic-link / password-reset email templates. Without them on the allowlist Supabase rejects redirects.

## 5. Copy credentials

From **Project Settings → API:**

| Value | Used by | Where |
|---|---|---|
| Project URL (`https://<ref>.supabase.co`) | Client | `PUBLIC_SUPABASE_URL` build-time env |
| `anon` `public` API key | Client | `PUBLIC_SUPABASE_ANON_KEY` build-time env |
| JWKS URL | Server | `SUPABASE_JWKS_URL` runtime env |

The `service_role` key is **never** copied into xstream — it bypasses RLS and we don't administer users from the desktop.

## 6. Local dev wiring

Dev secrets are managed by Doppler in the xstream project. Add these three values to the Doppler `dev` config:

```
PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<paste from dashboard>
SUPABASE_JWKS_URL=https://<ref>.supabase.co/.well-known/jwks.json
```

Doppler injects them when you run `doppler run -- bun run dev` or `doppler run -- bun run dev:server`. Rsbuild reads the `PUBLIC_*` vars at build time and bakes them into the client bundle (`client/rsbuild.config.ts`). The server reads `SUPABASE_JWKS_URL` at startup (`server-rust/src/lib.rs::run`).

## 7. JWT expiry — raise to ~30 days for offline-first use

**Authentication → Settings → JWT expiry:**

Set the token lifetime to **2592000 seconds (30 days)**. The default (1 hour) is too short for a desktop app that is frequently offline — an expired token causes the Supabase SDK's `getSession()` call to fail even when the user is legitimately signed in but offline.

xstream's `restoreSession()` has a fallback path (`readPersistedIdentity()`) that reads the token from localStorage without a Supabase network call, and `subscribeToAuthChanges` only clears identity on explicit `SIGNED_OUT` events, so the client side is resilient. But that resilience only applies while the token is still within its TTL — if the TTL is 1 hour and the user is offline for 2 hours, the next online refresh will see an expired token rather than gracefully extending it.

**Trade-off:** Long-lived JWTs can't be revoked server-side (xstream verifies signatures only). Acceptable while the JWT is used only for telemetry attribution and carries no server-side authorisation. See [`docs/architecture/Identity/02-Session-And-Refresh.md`](../Identity/02-Session-And-Refresh.md) §Token TTL for full rationale.

## 8. CI / release wiring

Set the same three env vars as GitHub Actions repository secrets. The Tauri release workflow embeds the `PUBLIC_*` pair into the client bundle and exposes `SUPABASE_JWKS_URL` to the Rust server at runtime. Token rotation = revoke + new release; the embedded anon key has no rotation concern because it's public by design.
