# Supabase Identity — Security Posture

Companion to [`05-Telemetry-Ingestion-Security.md`](05-Telemetry-Ingestion-Security.md). Same framing: assume the desktop bundle is fully reverse-engineerable, decide what's safe to embed, document what stays out.

## What ships in the bundle

| Value | Risk if extracted | Why safe |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | None | Public — every Supabase client embeds it. |
| `PUBLIC_SUPABASE_ANON_KEY` | New anonymous signups against your project (which is what it's already designed to do) | Public by Supabase doctrine; RLS is the data guard. We currently store essentially nothing in Supabase beyond `auth.users`. |
| `SUPABASE_JWKS_URL` (server) | None | Public endpoint. Anyone can fetch your JWKS — that's how RS256 verification works. |

The blast radius of a "leaked" bundle is therefore: someone who installed xstream can sign up new accounts on your Supabase project. Same as if they typed the email field on a public webpage.

## What MUST NOT ship

| Value | Why it must not | Mitigation |
|---|---|---|
| Supabase **service-role** key | Bypasses RLS on the entire project — attacker can read/write any user's data. | Never imported anywhere in `xstream/`. Alpha doesn't need it (we only *verify* JWTs, never administer users). |
| Supabase **JWT signing secret** (HS256 mode) | Symmetric — anyone with this can forge tokens for any user. | Avoided entirely by using **RS256**. The server holds only public JWKS; there is no shared secret to leak. |
| SMTP creds (for password-reset emails) | Email-based phishing pivot. | Supabase sends mail on its own infra. We never touch SMTP. |
| Any **admin / dashboard** Supabase credentials | Project takeover. | Operators sign in via the Supabase web dashboard; nothing in the desktop bundle talks to admin APIs. |

## Worst-case leak posture

A bundle is recovered, all embedded values are extracted. The attacker now has:

- A public Supabase URL.
- A public anon key.
- A public JWKS URL.

What they can do:

- Sign up new accounts on your Supabase project (rate-limited by Supabase's anti-abuse layers).
- Verify signatures of legit Supabase-issued JWTs.

What they **cannot** do:

- Forge JWTs as another user — they don't have the private signing key (it never leaves Supabase).
- Bypass RLS on user data — RLS rules execute on Supabase's side, scoped to the JWT's `sub`.
- Read another user's email, history, or session — nothing is exposed via the anon key.
- Pivot to xstream telemetry — the OTel ingest tokens are a separate concern (see `05-Telemetry-Ingestion-Security.md`).

## Forging a `user_id` locally

A user can patch their own xstream binary or webview JS bundle to set `RequestContext.user_id` to anything. The local Rust server runs in their own process — they own the bytes.

This is **not a security concern** in alpha because:

- Identity is for telemetry correlation, not access control.
- The user's own Supabase project knows their real identity (issued JWT) — local self-spoofing only confuses their own telemetry, not Supabase's records.
- Forging a `user_id` doesn't give them access to another Supabase user's data — that's still gated by Supabase RLS against the real JWT (which they can't forge without Supabase's private key).

When peer sharing ships and `user_id` becomes load-bearing for authorization on remote peers, that authorization runs on the **peer's** server (not the local self-spoofer's), and the peer enforces the real JWT signature. Local spoofing remains a local-only confusion.

## Key rotation

- **Supabase JWT signing key.** Rotate from the dashboard (Authentication → JWT Signing Keys). Old tokens invalidate on next refresh. Client SDK auto-refresh handles the swap; users on offline cached tokens get soft-failed `user.id = None` until they reconnect.
- **xstream release with rotated `PUBLIC_*` env.** The anon key has no real rotation requirement since it's public; we rotate it only if Supabase asks. Service-role keys aren't in the bundle; they're never rotated through xstream's release pipeline.

## HS256 fallback (avoid if possible)

If asymmetric keys are unavailable on your Supabase plan/region:

- Server needs the JWT secret to verify. This is **shared** with the client SDK only at Supabase's edge; xstream's client never sees it.
- The secret would be a server-only env var (`SUPABASE_JWT_SECRET`). For Tauri's in-process model, that means embedding it in the bundle anyway — same problem as embedding the service role key but smaller blast radius (forging tokens, not bypassing RLS).
- **We do not ship this configuration.** If you can't get asymmetric keys, run a sidecar JWT-verification service or wait for Supabase to GA asymmetric in your region.
