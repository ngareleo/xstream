# Identity — Telemetry Correlation

The load-bearing alpha outcome: every OTel event xstream emits carries a verified `user.id` when the user is signed in. This is *why* identity exists in alpha — see `00-System-Overview.md` for the framing.

## Standard attributes

| Attribute | Type | Source | Correlation |
|---|---|---|---|
| `user.id` | string | Supabase UUID from JWT `sub` (verified) | Identifies the signed-in user across all requests and sessions. Empty for anonymous/peer requests. |
| `session.id` | string | Client-side UUID (random) via `x-session-id` header | Correlates all server events within a user session. See §"User sessions: activity-based tracking" in `01-Logging-Policy.md`. |

These are the only identity attributes; we do not stamp email or display name on telemetry — those live in Supabase and can be looked up by `user.id` when investigating an incident.

## Server side

`server-rust/src/request_context.rs` declares `user.id = tracing::field::Empty` on the `http.request` span when the request enters. The middleware `extract_auth_identity` reads `Authorization: Bearer …`, verifies via JWKS, and calls `tracing::Span::current().record("user.id", &claims.sub)`.

`tracing` requires the field to be pre-declared at span creation — that's why the `info_span!` in `extract_request_context` lists `user.id = tracing::field::Empty`. Without the declaration, `record` later is a silent no-op.

The OTel export picks up the field and attaches it as a span attribute. Every event emitted **inside** the request scope (resolver work, DB queries, ffmpeg orchestration) is parented to this span via `.instrument(span.clone())` — child events inherit the parent's `trace_id` and the same Seq event group, so a single Seq filter on `user.id = "<uuid>"` pulls the whole request tree.

## Server-side: `session.id` propagation

`server-rust/src/request_context.rs` declares `session.id = tracing::field::Empty` on the `http.request` span when the request enters (same pattern as `user.id`). The client sends the session UUID as the `x-session-id` HTTP header on both GraphQL requests and streaming requests. The server's middleware `extract_request_context` calls `session_id_from_headers(req.headers())` synchronously at span creation, which reads the `x-session-id` value (or returns `None` if absent or blank), and records it on the span:

```rust
// In extract_request_context
if let Some(session_id) = session_id_from_headers(req.headers()) {
    span.record("session.id", session_id.as_str());
}
```

The key difference from `user.id` is **timing**: the header is available immediately (no async JWT verification required), so recording is synchronous at span creation. Child server logs and spans inherit `session.id` via the `.instrument(span.clone())` scope, matching the `user.id` pattern. A Seq filter on `session.id = "<uuid>"` pulls all events from that session across both client and server.

The helper `session_id_from_headers` (public, in `request_context.rs`) trims whitespace and returns `None` for blank or absent headers — so anonymous requests (no signed-in user, no active session on the client side) do not pollute `session.id` with noise. Unit tests in `request_context.rs` verify both present and absent/blank cases.

## Client side

`client/src/services/userContext.ts` holds a module-scoped `currentUserId`. The auth service calls `setUserContext(user.id)` after sign-in/restore and `clearUserContext()` on sign-out.

`client/src/telemetry.ts` reads `getUserContext()` **at log-record emit time** inside `getClientLogger()`. The function returns either `{ "user.id": "<uuid>" }` or `{}` so log records stay clean when no user is signed in.

We do **not** stamp `user.id` as an OTel resource attribute. Resource attributes are frozen at provider init — they would always be empty (user not signed in at boot) or stale (user signed out, attribute still set). Per-emit attachment matches the user's actual session state at the moment the record is created.

## Cross-language verification

Pick a known action and confirm both sides stamped consistently:

1. Sign in. Note the user UUID from `currentUser { id }` GraphQL query (or read it from the JWT in DevTools).
2. Start playback of any video. The client emits logs with `session.id` (visible in the browser DevTools or Seq); the server receives the `x-session-id` header and records it on the `http.request` span.
3. In Seq (via the `seq` skill), filter on `user.id = "<uuid>"` or `session.id = "<uuid>"`. Expect:
   - One server `http.request` span per Relay query/mutation, each carrying both `user.id` and `session.id`.
   - Client log records from `getClientLogger("…")` with both attributes.
   - `trace_id` chains the two so client → server requests share a single tree.
   - When filtering by `session.id`, all client and server events from that session appear in a single view, even across multiple requests (GraphQL queries, stream fetches).

## Privacy

`user.id` is a Supabase-issued UUID. It's not PII on its own — looking up the email behind a UUID requires Supabase access. Telemetry users with read access to Seq/Axiom datasets can correlate sessions but cannot recover identities without separate Supabase credentials.

`docs/architecture/Observability/01-Logging-Policy.md` covers the broader redaction/PII rules.
