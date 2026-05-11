# Identity — Telemetry Correlation

The load-bearing alpha outcome: every OTel event xstream emits carries a verified `user.id` when the user is signed in. This is *why* identity exists in alpha — see `00-System-Overview.md` for the framing.

## Standard attribute name

`user.id` (string, Supabase UUID from JWT `sub`). This is the only identity attribute; we do not stamp email or display name on telemetry — those live in Supabase and can be looked up by `user.id` when investigating an incident.

## Server side

`server-rust/src/request_context.rs` declares `user.id = tracing::field::Empty` on the `http.request` span when the request enters. The middleware `extract_auth_identity` reads `Authorization: Bearer …`, verifies via JWKS, and calls `tracing::Span::current().record("user.id", &claims.sub)`.

`tracing` requires the field to be pre-declared at span creation — that's why the `info_span!` in `extract_request_context` lists `user.id = tracing::field::Empty`. Without the declaration, `record` later is a silent no-op.

The OTel export picks up the field and attaches it as a span attribute. Every event emitted **inside** the request scope (resolver work, DB queries, ffmpeg orchestration) is parented to this span via `.instrument(span.clone())` — child events inherit the parent's `trace_id` and the same Seq event group, so a single Seq filter on `user.id = "<uuid>"` pulls the whole request tree.

## Client side

`client/src/services/userContext.ts` holds a module-scoped `currentUserId`. The auth service calls `setUserContext(user.id)` after sign-in/restore and `clearUserContext()` on sign-out.

`client/src/telemetry.ts` reads `getUserContext()` **at log-record emit time** inside `getClientLogger()`. The function returns either `{ "user.id": "<uuid>" }` or `{}` so log records stay clean when no user is signed in.

We do **not** stamp `user.id` as an OTel resource attribute. Resource attributes are frozen at provider init — they would always be empty (user not signed in at boot) or stale (user signed out, attribute still set). Per-emit attachment matches the user's actual session state at the moment the record is created.

## Cross-language verification

Pick a known action and confirm both sides stamped consistently:

1. Sign in. Note the user UUID from `currentUser { id }` GraphQL query (or read it from the JWT in DevTools).
2. Start playback of any video.
3. In Seq (via the `seq` skill), filter on `user.id = "<uuid>"`. Expect:
   - One server `http.request` span per Relay query/mutation, each carrying `user.id`.
   - Client log records from `getClientLogger("…")` with `user.id` in their attributes.
   - `trace_id` chains the two so client → server requests share a single tree.

## Privacy

`user.id` is a Supabase-issued UUID. It's not PII on its own — looking up the email behind a UUID requires Supabase access. Telemetry users with read access to Seq/Axiom datasets can correlate sessions but cannot recover identities without separate Supabase credentials.

`docs/architecture/Observability/01-Logging-Policy.md` covers the broader redaction/PII rules.
