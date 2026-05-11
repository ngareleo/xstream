# Identity — Session and Refresh

## Token lifecycle

- **Issued by** Supabase on every `signInWithPassword` / `signUp` / `refreshSession`. Algorithm: RS256.
- **Default expiry** 1 hour. Refresh token is opaque, longer-lived, also stored in localStorage by the Supabase SDK.
- **Refresh trigger** Supabase JS SDK auto-refreshes ~5 minutes before expiry. The refresh fires in the background; subsequent `getAccessToken()` calls see the rotated token without the caller having to do anything.
- **Verified at the server** via JWKS — the server holds **public keys only** (`SUPABASE_JWKS_URL`). No shared secret.

## JWKS cache shape

`server-rust/src/services/auth.rs` holds an `Arc<JwksCache>` on `AppContext`. The cache:

- Fetches on first use (lazy).
- Refreshes when entry TTL has elapsed (10 min) **or** when a `kid` lookup misses (rotation hint).
- Failure to fetch: logs `warn!`, retains stale cache, returns an `AuthError`. Never panics, never blocks startup.

The middleware `extract_auth_identity` is **soft-fail** by design — a missing/invalid/unverifiable token leaves `RequestContext.user_id = None` and the request continues. Alpha doesn't gate, so the only consequence is unattributed telemetry.

## Offline mode

The Supabase SDK reads the session from localStorage at boot, so an offline user lands signed-in if they were signed in last session. The cached JWT may be expired; auto-refresh will fail until connectivity returns, but in-app queries continue to fire because:

- The Relay fetch still attaches the cached (possibly expired) Bearer token.
- The server's JWKS cache served the last fetch's keys — verifies signature locally without a network call.
- Server soft-fails on signature error → `user_id = None`, request proceeds.

When connectivity returns, the SDK refreshes and subsequent fetches carry a fresh token. No explicit user action required.

## JWKS unreachable at boot

If `SUPABASE_JWKS_URL` is unreachable the first time the server tries to fetch (DNS failure, firewall, project decommissioned), the cache stays empty. Every request soft-fails to `user_id = None`. The server starts and serves; telemetry just lands unattributed until JWKS comes back.

We considered failing the request with 401 in this case, but: (a) the server runs in-process under user control, so blocking the local UI behind a remote dependency is hostile UX, and (b) alpha is telemetry-only, so unattributed events are a known acceptable degradation.

## Known gaps

These ship deliberately as alpha tech debt:

### WS subscription auth

The HTTP path validates JWTs. The GraphQL **subscription** path (graphql-transport-ws over `/graphql`) does **not** validate the `connection_init` payload's `authorization` field. The reason is a version split in the dependency tree:

- The rest of the server uses `axum = "0.7"`.
- `async-graphql-axum = "7.2.1"` pins `axum = "0.8"` internally.

`async-graphql-axum::GraphQLSubscription` exposes a `Service` interface whose internal types come from axum 0.8, while our handlers and `Extension` extractors are axum 0.7. A custom `on_connection_init` handler — which is the mechanism for inspecting the payload — would need to construct a `GraphQLWebSocket` directly, and that requires axum 0.8's `WebSocketUpgrade`, which doesn't unify with our 0.7 stack.

For alpha this is acceptable because **no subscription resolver currently reads `RequestContext.user_id`** — subscriptions are server-internal events (`library_scan_updated`, `transcode_job_updated`) that aren't user-scoped. The client already sends the Bearer token via `connectionParams` so once the version split resolves the server side can pick it up unchanged.

Tracked for resolution when:
- async-graphql-axum publishes an axum-0.7-compatible release (unlikely; the trend is 0.8+), **or**
- xstream's broader stack moves to axum 0.8 (large blast radius — defer until there's another reason).

### No local users table

Today xstream's SQLite has no `users` table. `user_id` is a UUID string sourced from the JWT `sub` claim and used denormalized as a foreign key on future tables. Supabase is the source of truth.

This becomes load-bearing when peer sharing ships — peers need to look up owner metadata (display name, avatar) without round-tripping to Supabase. The fix is straightforward: add a `users` table that syncs from Supabase on first observation. Out of scope for alpha.

### Storage in localStorage, not Tauri secure storage

Supabase JS SDK defaults to localStorage. In Tauri's webview, that's per-app-data-dir storage, persisted across launches. A user with filesystem access to their own machine can read the JWT — but that user is already the legitimate user, and the only thing the JWT does is identify them in our telemetry. Moving to Tauri secure storage (OS keyring) is a clear improvement, not urgent.

### Tampered token soft-fail vs 401

If a webview injects garbage into localStorage, the Bearer header carries garbage, JWKS verify fails, server logs at `debug` and proceeds with `user_id = None`. The user gets unattributed telemetry but the app still works.

We chose soft-fail over 401 because the alpha doesn't gate. Once gating exists, this flips to 401 and the client treats it as "session invalid → navigate to /signin".
