# Identity — Session and Refresh

## Local session model

Starting with PR `fix/seven-bugs-auth-profiles-detail`, xstream's in-process Rust service issues
**its own local session token** after an online Supabase login. Supabase JWTs are used only
once — to prove the user's credentials at mint time — and are **not verified on every request**.
The local token validates entirely offline.

### Mint (online, once per ~30 days)

```
[ SignInPage / signUp ]       [ auth.ts: exchangeForLocalSession ]       [ POST /auth/session ]
        │                                      │                                    │
  signInWithPassword()  ────────────────────────▶                                   │
  ◀── { session.access_token }                 │                                    │
                                POST /auth/session (Bearer <supabase-jwt>) ────────▶ │
                                                                  jwks.verify_token() │
                                                                  local_session::mint │
                                                                  sessions INSERT     │
                                               ◀── { token, userId, email, expiresAt }
  writeLocal(LocalStorageKey.Session, token)   │
  setUserContext(userId, email)                │
```

1. `signInWithPassword` (Supabase SDK) verifies the user's credentials online and returns a
   Supabase access token.
2. The client immediately POSTs that token to `POST /auth/session` as a Bearer header.
3. The server (`routes/auth.rs::issue_session`) verifies the Supabase JWT via JWKS (online),
   then calls `services::local_session::mint` to sign an HS256 local token.
4. The minted token plus a `sessions` row (`jti, user_id, email, issued_at, expires_at,
   revoked_at`) are stored. The response body is camelCase JSON:
   `{ token, userId, email, expiresAt }`.
5. The client stores the token under `LocalStorageKey.Session` (`xstream:session`) and mirrors
   `userId` / `email` into `userContext`.

### Per-install secret

`services::local_session::get_or_create_secret` generates the HMAC signing secret once
(two v4 UUIDs concatenated = 256 bits of entropy), persists it in `user_settings` under
`localSessionSecret`, and loads it into `AppContext.local_session_secret` at boot. Because
`wipe_db` preserves `user_settings`, the same secret survives across library wipes — users
don't have to re-authenticate when they wipe their library index.

The secret is **per-install**. It never ships in the bundle; it never leaves the machine.

### Token shape

Algorithm: **HS256**, signed with the per-install secret.

Claims: `sub` (Supabase user UUID), `email`, `jti` (UUIDv4 — used as the revocation key),
`iat`, `exp`.

**Absolute ~30-day TTL — no sliding refresh.** When `exp` lapses the user must sign in online
again (which re-mints a new token). There is no background refresh mechanism.

### Carrying the local token (offline)

`getAccessToken()` returns the token stored under `LocalStorageKey.Session`. Relay's
`environment.ts` attaches it as `Authorization: Bearer <local-token>` on every HTTP GraphQL
request and on the graphql-ws `connectionParams`.

`restoreSession()` (called at boot in `main.tsx`) decodes the stored token's `exp` **offline**
and restores `userContext` when unexpired — no network call required. The old
`readPersistedIdentity` Supabase-key reader and its `sb-*-auth-token` localStorage dependency
are removed.

`subscribeToAuthChanges` no longer mutates `userContext` — identity is driven by the local
session, not Supabase auth-state events. Supabase background token refreshes do not disturb the
local-session gate.

### Per-request auth (offline)

`request_context.rs::extract_auth_identity` verifies the local token at every HTTP request:

1. HS256 signature verification + `exp` check (fully offline — no network).
2. `db::is_session_active(jti)` — one SQLite lookup to confirm the row isn't revoked.
3. On success: records `user.id` on the `http.request` span, sets `RequestContext.user_id`.
4. Soft-fail on any mismatch — absent/invalid/revoked tokens continue as anonymous.
   Alpha doesn't gate resolvers.

Supabase JWTs are **never** verified per-request. JWKS is called only at `/auth/session`
issue time.

### Expiry → online re-login

When the absolute 30-day TTL lapses, `validLocalClaims()` returns null. The user is
unauthenticated. The next server request carries no valid Bearer token, soft-fails to
`user_id = None`, and the client UI guards route the user to `/signin`.

### Logout → revocation

```
[ AccountTab ]          [ auth.ts: signOut ]         [ POST /auth/logout ]
      │                         │                              │
  click "Sign out" ─────────────▶                              │
                     POST /auth/logout (Bearer <local-token>) ▶ │
                                                   revoke_session(jti) │
                                                   ◀── 204 No Content ─
                     writeLocal(Session, null)     │
                     getSupabase().auth.signOut()  │
                     clearUserContext()            │
      ◀── done ──────────────────────────
```

`routes/auth.rs::logout` sets `sessions.revoked_at` on the matching `jti`. Subsequent
requests carrying the revoked token fail the `is_session_active` check and continue as
anonymous. The endpoint is idempotent — missing or unverifiable tokens still return 204.

**This is a new capability.** The previous Supabase-JWT-per-request model had no revocation —
RS256 tokens are valid until `exp` regardless of sign-out. The local session model allows
immediate server-side revocation.

## REST endpoints (all new)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/auth/session` | Bearer Supabase JWT | Exchange Supabase token for a local session token |
| `POST` | `/auth/logout` | Bearer local token | Revoke the caller's session (idempotent) |
| `GET` | `/auth/me` | Bearer local token | Offline identity check — returns `{ userId, email }` or 401 |

All REST (no GraphQL schema change). CORS already allows credentials + the Authorization
header.

## Supabase JWT TTL

Supabase access tokens can be **short-lived** (the default 1 hour is fine). The local session
owns the 30-day offline-valid lifetime; Supabase tokens are consumed immediately at
`/auth/session` and discarded. Operators no longer need to raise the Supabase JWT expiry.

See [`docs/architecture/Deployment/06-Supabase-Project-Setup.md`](../Deployment/06-Supabase-Project-Setup.md)
for the updated operator runbook.

## JWKS cache shape

`server-rust/src/services/auth.rs` holds an `Arc<JwksCache>` on `AppContext`. The cache:

- Fetches on first use (lazy).
- Refreshes when entry TTL has elapsed (10 min) **or** when a `kid` lookup misses.
- Failure to fetch: logs `warn!`, retains stale cache, returns an `AuthError`. Never panics,
  never blocks startup.

Because JWKS is only consulted at `/auth/session`, a JWKS outage after the first mint does
not affect ongoing request auth (that now runs offline via the local token).

## JWKS unreachable at boot

If `SUPABASE_JWKS_URL` is unreachable at startup, the cache stays empty. `/auth/session`
returns 503 (`auth is not configured`) until connectivity returns. All other endpoints
continue to work — they verify the local HS256 token, which is purely offline. Existing
sessions issued before the outage remain valid.

## Known gaps

These ship deliberately as alpha tech debt.

### WS subscription auth

The HTTP path validates local session tokens. The GraphQL **subscription** path
(graphql-transport-ws over `/graphql`) does **not** validate the `connection_init` payload's
`authorization` field. The cause is a version split:

- The rest of the server uses `axum = "0.7"`.
- `async-graphql-axum = "7.2.1"` pins `axum = "0.8"` internally.

A custom `on_connection_init` handler would need `GraphQLWebSocket` from axum 0.8, which
doesn't unify with the 0.7 stack.

Acceptable for alpha because **no subscription resolver currently reads `RequestContext.user_id`**
— subscriptions are server-internal events (`library_scan_updated`, `transcode_job_updated`)
that aren't user-scoped. The client already sends the Bearer token via `connectionParams`; once
the version split resolves the server side can pick it up unchanged.

### No local users table

`user_id` is the Supabase `sub` UUID, now embedded in the local token as `LocalClaims.sub`.
SQLite has no `users` table — Supabase remains the source of truth for display name, email,
and account management. This becomes load-bearing when peer sharing ships.

### Storage in localStorage, not Tauri secure storage

The local session token is stored under `xstream:session` in localStorage. In Tauri's webview
that's per-app-data-dir storage. A user with filesystem access to their own machine can read
the token, but: (a) that user is the legitimate user, (b) the token is revocable server-side,
(c) it carries only `user_id` and `email` — no credentials or authorisation grants.

Moving to Tauri secure storage (OS keyring) is an improvement; not urgent for alpha.

### Soft-fail vs 401 on invalid/revoked token

An invalid or revoked token continues as anonymous rather than returning 401. This flips once
alpha gating lands — resolvers behind auth will need the 401 path and the client will treat it
as "session invalid → navigate to /signin".
