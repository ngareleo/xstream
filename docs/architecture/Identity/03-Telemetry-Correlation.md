# Identity — Telemetry Correlation

The load-bearing alpha outcome: every OTel event xstream emits carries a verified `user.id`
when the user is signed in. This is *why* identity exists in alpha — see
`00-System-Overview.md` for the framing.

## Standard attributes

| Attribute | Type | Source | Correlation |
|---|---|---|---|
| `user.id` | string | Supabase UUID (`sub`) embedded in the local session token | Identifies the signed-in user across all requests and sessions. Empty for anonymous/peer requests. |
| `session.id` | string | Client-side UUID (random) via `x-session-id` header | Correlates all server events within a user session. See §"User sessions: activity-based tracking" in `01-Logging-Policy.md`. |

These are the only identity attributes; we do not stamp email or display name on telemetry —
those live in Supabase and can be looked up by `user.id` when investigating an incident.

## Server side

`server-rust/src/request_context.rs` declares `user.id = tracing::field::Empty` on the
`http.request` span when the request enters. The middleware `extract_auth_identity`:

1. Reads `Authorization: Bearer …` from the request headers.
2. Verifies the **local session token** (HS256 signature + `exp`) offline via
   `services::local_session::verify`.
3. Confirms the session is not revoked via `db::is_session_active(jti)`.
4. On success: calls `tracing::Span::current().record("user.id", &claims.sub)`.

The `sub` claim in the local token is the Supabase user UUID — the same UUID value as before,
now carried in the local token rather than read from a Supabase JWT.

`tracing` requires the field to be pre-declared at span creation — that's why the `info_span!`
in `extract_request_context` lists `user.id = tracing::field::Empty`. Without the declaration,
`record` later is a silent no-op.

The OTel export picks up the field and attaches it as a span attribute. Every event emitted
**inside** the request scope (resolver work, DB queries, ffmpeg orchestration) is parented to
this span via `.instrument(span.clone())` — child events inherit the parent's `trace_id` and
the same Seq event group, so a single Seq filter on `user.id = "<uuid>"` pulls the whole
request tree.

## Server-side: `session.id` propagation

`server-rust/src/request_context.rs` declares `session.id = tracing::field::Empty` on the
`http.request` span. The client sends the session UUID as the `x-session-id` HTTP header on
both GraphQL requests and streaming requests. The middleware records it synchronously at span
creation:

```rust
if let Some(session_id) = session_id_from_headers(req.headers()) {
    span.record("session.id", session_id.as_str());
}
```

The key difference from `user.id` is **timing**: the header is available immediately (no async
token verification required), so recording is synchronous. Child server logs and spans inherit
`session.id` via the `.instrument(span.clone())` scope. A Seq filter on `session.id = "<uuid>"`
pulls all events from that session across both client and server.

`session_id_from_headers` trims whitespace and returns `None` for blank or absent headers —
anonymous requests do not pollute `session.id` with noise.

## Client side

`client/src/services/userContext.ts` holds a module-scoped `currentUserId` and `currentEmail`.
`setUserContext(userId, email)` is called after a successful sign-in (from
`exchangeForLocalSession`) and after `restoreSession()` restores from the stored local token.
`clearUserContext()` is called on sign-out.

`client/src/telemetry.ts` reads `getUserContext()` **at log-record emit time** inside
`getClientLogger()`. The function returns either `{ "user.id": "<uuid>" }` or `{}` so log
records stay clean when no user is signed in.

We do **not** stamp `user.id` as an OTel resource attribute. Resource attributes are frozen at
provider init — they would always be empty (user not signed in at boot) or stale (user signed
out, attribute still set). Per-emit attachment matches the user's actual session state at the
moment the record is created.

## Cross-language verification

Pick a known action and confirm both sides stamped consistently:

1. Sign in. Note the user UUID from `userContext` (or read `sub` from the stored
   `xstream:session` token via DevTools → Application → Local Storage).
2. Start playback of any video. The client emits logs with `session.id` (visible in the browser
   DevTools or Seq); the server receives the `x-session-id` header and records it on the
   `http.request` span.
3. In Seq (via the `seq` skill), filter on `user.id = "<uuid>"` or `session.id = "<uuid>"`.
   Expect:
   - One server `http.request` span per Relay query/mutation, each carrying both `user.id`
     and `session.id`.
   - Client log records from `getClientLogger("…")` with both attributes.
   - `trace_id` chains the two so client → server requests share a single tree.
   - When filtering by `session.id`, all client and server events from that session appear in
     a single view, even across multiple requests (GraphQL queries, stream fetches).

## Privacy

`user.id` is a Supabase-issued UUID. It's not PII on its own — looking up the email behind a
UUID requires Supabase access. Telemetry users with read access to Seq/Axiom datasets can
correlate sessions but cannot recover identities without separate Supabase credentials.

`docs/architecture/Observability/01-Logging-Policy.md` covers the broader redaction/PII rules.
