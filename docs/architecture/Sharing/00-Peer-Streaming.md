# Peer-to-Peer Streaming

> **Status:** forward design. The Rust + Tauri server preserves every constraint listed under "Invariants" so this design is reachable without re-architecting.

A second user (node B) streams content directly from a first user's running xstream Tauri app (node A). No central server, no SaaS, no app-store mediator. Node A's React client and node B's React client use the **same code path** to reach a Rust server — the only difference is the base URL and an auth header.

## 1. Mental model — passthrough, not proxy

The word "proxy" appears in earlier planning notes, but **the Rust server is never a proxy in the HTTP-CONNECT sense.** Each Tauri instance runs its full Rust server: GraphQL + binary stream endpoint + library scanner + ffmpeg subprocess. When user A shares a video with user B:

1. Node A is reachable at some `https://<node-a-host>:<port>` (LAN-direct, user-configured public URL, or a tunnel — see "Network reachability" below).
2. User A signs and hands user B an **invite token** that grants access to a specific video, library, or profile.
3. User B's React client points its `/graphql` and `/stream/:jobId` calls at `https://<node-a-host>:<port>` and presents the token in a header.
4. Node A's Rust server verifies the token, runs the same resolvers and stream handler it would for a loopback request from its own client, and returns segments.

```
┌──────────────────┐                 ┌──────────────────┐
│  Node A          │                 │  Node B          │
│  ┌────────────┐  │                 │  ┌────────────┐  │
│  │ React app  │──┼─loopback────┐   │  │ React app  │  │
│  └────────────┘  │             │   │  └─────┬──────┘  │
│  ┌────────────┐  │             ▼   │        │         │
│  │ Rust       │◀─┼─────────────────┼────────┘         │
│  │ server     │  │   GraphQL +     │   (with invite   │
│  │ + ffmpeg   │  │   binary stream │    token header) │
│  └────────────┘  │                 │                  │
└──────────────────┘                 └──────────────────┘
```

**Critical consequence**: the React/Relay client is **architecturally untouched** by the introduction of sharing. The Relay environment's `fetch` is configured with a base URL and a header set; pointing both at a different node is a configuration change, not a code change. This is the "client unchanged across sharing" invariant — made structural by the wire protocol staying identical (see [`docs/architecture/Streaming/00-Protocol.md`](../Streaming/00-Protocol.md)).

## 2. Node identity — keypair, not username

Each Tauri instance owns an **Ed25519 keypair** generated at first launch:

- Private key stored in OS-native secure storage (macOS Keychain, Windows Credential Manager, Linux Secret Service via libsecret) using `tauri-plugin-stronghold` or platform-specific bindings.
- Public key written to the identity DB (`<app_data_dir>/xstream-identity.db`, see [`docs/architecture/Deployment/01-Packaging-Internals.md`](../Deployment/01-Packaging-Internals.md) §"Two-DB schema split") and exposed in invite tokens + a UI "show my node ID" surface.

There is no concept of a per-user account. The node IS the user; if user A wants to share between their phone and laptop they need to either run two nodes (separate keypairs) or sync one identity DB across machines manually (out of scope for v1).

### Invite tokens

A token is a signed claim: "node A grants `<scope>` to anyone presenting node B's pubkey, until `<expiry>`."

```
ShareToken {
  iss: "<node-a-pubkey>",                    // issuer = node A
  sub: "<node-b-pubkey>",                    // subject = node B (token is non-transferable)
  scope: ShareScope,                         // what's granted
  exp: u64,                                  // unix seconds
  jti: [u8; 16]                              // random nonce for replay protection
}

ShareScope (one of):
  Video { video_id: GlobalId }
  Library { library_id: GlobalId }
  Profile { /* future — full library catalog access */ }
```

Encoded as `base64(serde_json(claim) || ed25519_signature)` for ergonomics (debuggability beats compactness; the wire is short-lived), or as a compact `JWT` with `EdDSA` algorithm if a stricter format is preferred. **Decision deferred** — see "Open questions".

### Token delivery

User A delivers `(invite_token, node_a_url, node_a_pubkey)` to user B **out of band**: QR code, copy/paste a link, end-to-end encrypted chat. The xstream app does not implement an in-app messaging layer; it implements the receive side (paste + verify) and the send side (generate + display).

Node B presents the token on every request:

```
GET /stream/:jobId HTTP/1.1
Host: node-a-host:port
x-xstream-share-token: <base64(claim||signature)>
x-xstream-peer-pubkey: <node-b-pubkey>
traceparent: 00-...
```

`x-xstream-peer-pubkey` lets node A reject early if `token.sub != peer_pubkey` without parsing the claim deeply. The full verification (signature, expiry, scope match against the requested resource) lives in the `RequestContext` middleware.

## 3. Request context middleware — established now, used later

The server's axum stack lands `extract_request_context` from day one even though it currently only carries the W3C trace context. When sharing arrives, the middleware grows to:

```rust
// services/middleware/request_context.rs (sharing-shaped, not landed yet)
#[derive(Clone)]
pub struct RequestContext {
    pub trace_context: opentelemetry::Context,
    pub identity: Identity,                    // NEW
}

#[derive(Clone)]
pub enum Identity {
    Local,                                     // loopback — current behaviour, single permitted state today
    Peer(PeerGrant),                           // verified inbound peer
}

#[derive(Clone)]
pub struct PeerGrant {
    pub peer_pubkey: [u8; 32],
    pub scope: ShareScope,
    pub token_jti: [u8; 16],                   // for replay-detection cache
}
```

Every handler signature already accepts `Extension<RequestContext>` — threaded from day one so adding identity does not change call sites. When sharing ships:

- The middleware reads `x-xstream-share-token` + `x-xstream-peer-pubkey`.
- If headers are absent and the connection is on a loopback bind, identity is `Local`.
- If headers are present, the middleware verifies the signature against node A's own pubkey, checks `exp`, checks `sub == peer_pubkey`, and constructs `Identity::Peer(grant)`.
- Handlers that need to authorise read `request_context.identity.scope_grants(&requested_resource)` — a method that returns true for `Local` and runs scope-against-resource matching for `Peer`.

**Retrofitting auth into handler signatures later is a diffuse, untestable change.** Establishing the seam with a no-op identity today means sharing's PR is a focused diff against a few middleware files, not a multi-thousand-line shotgun edit.

## 4. Content-addressed segment cache (cross-link)

Two peers asking node A for byte-identical segments must dedup to one ffmpeg process and one on-disk cache. This is **already structural** because the job ID is content-addressed (sha1 of `content_fingerprint || resolution || start || end`) — and the lookup index `(video_id, resolution, start_s, end_s) → job_id` exists explicitly so a peer's request can hit the cache without going through the job-creation flow.

The cache + ffmpeg pool design lives in [`docs/architecture/Streaming/06-FfmpegPool.md`](../Streaming/06-FfmpegPool.md); not duplicated here. The sharing-relevant points:

- Per-connection pull isolation (each consumer has its own `mpsc` channel) means peer B reading the cache cannot back up peer C reading the same cache. See [`docs/architecture/Streaming/04-Demand-Driven-Streaming.md`](../Streaming/04-Demand-Driven-Streaming.md).
- Eviction must remove the index entry atomically with the segment-directory delete. Out-of-order deletion would let a peer's lookup return a `JobId` whose directory is gone.
- Fuzzy-range matching (peer C asks `[330s, 600s]` while node A has `[300s, 600s]`) is **out of scope**. Both produce separate runs.

## 5. Cross-peer observability — W3C traceparent unchanged

W3C trace-context is **already on the wire** because the server propagates `traceparent` through every fetch (`docs/architecture/Observability/00-Architecture.md`). Cross-peer flow:

```
Node B's React client:
  context.with(playback_session_ctx, () => fetch("https://node-a/stream/jobid", {
    headers: { traceparent, "x-xstream-share-token": ... }
  }))
       │
       ▼
Node B's traceparent: 00-aaaa....-bbbb....-01
       │
       ▼
Node A's axum server: extract_request_context middleware reads traceparent,
                      attaches it as Extension. stream::request span opens
                      WITH PARENT = received traceparent.
       │
       ▼
       │  Both nodes' OTel exporters ship spans to the same Seq endpoint
       │  (the host-of-shared-content's, by convention — node A in this case).
       ▼
Seq:   playback.session  (node B)
         └─ chunk.stream  (node B)
              └─ stream.request  (node A)        ← parented across the network
                   └─ transcode.job  (node A)
```

**No protocol change required.** The server's `extract_request_context` middleware (see [`docs/architecture/Observability/01-Logging-Policy.md`](../Observability/01-Logging-Policy.md)) is the single point that must NOT strip the inbound `traceparent` — restated as an invariant below.

The OTel exporter on each node should be configurable to ship to a designated Seq endpoint. Convention: when node A shares with node B, node B's exporter is configured to ship to node A's Seq (or the user-provided collector URL embedded in node A's invite token). **Decision deferred** — see "Open questions".

## 6. Network reachability — out of scope for v1

The current server binds `127.0.0.1` only. The bind address is a runtime config knob (`config.bind_addr`) so sharing can later flip it to `0.0.0.0` or a specific interface. Future options listed for context only:

- **LAN-direct + mDNS discovery** — easy if both peers are on the same network; the `mdns-sd` crate is the obvious pick. UX: appears in a "nearby nodes" list.
- **User-supplied URL** — works if peer is on a public IP, port-forwarded NAT, or behind a tunnel they manage. UX: paste a URL.
- **Self-hosted relay** — a small Rust service the user runs on a VPS holding WebSocket bridges between two nodes. Never sees plaintext bodies if framed correctly. Replaces the need for either peer to expose a public IP. Most complex; lowest UX friction.
- **Tailscale / WireGuard / ZeroTier tunnels** — user's own infrastructure; from the Rust server's point of view this is just "bind to a non-loopback interface and accept TLS-fronted requests". Probably the simplest first deploy for technical users.

**Constraint**: the server's TLS termination strategy is open. For LAN-direct + mDNS it likely needs to generate a self-signed cert and ship the fingerprint inside the invite token; for tunnels or user-supplied URLs the user provides their own cert. Decided per scenario.

## 7. Concurrent-streams budget

The streaming pipeline targets these as design budgets — exercised by the integration tests under [`docs/architecture/Streaming/`](../Streaming/README.md):

| Dimension | Target | Why |
|---|---|---|
| Concurrent connections per ffmpeg job | **10+** | One local user + multiple peers consuming the same content. Per-connection pull isolation means each consumer runs an independent `mpsc` channel over the watcher events; ffmpeg is unaware of consumer count. |
| Concurrent ffmpeg jobs | **5+** within `MAX_CONCURRENT_JOBS` semaphore (configurable) | Different content, different resolutions. Today the cap is 3; sharing motivates raising the default to 5 on capable hardware. The semaphore is per-node, not per-connection. |
| Per-connection memory ceiling | **mpsc capacity × segment size** ≈ 16 × 6 MB at 4K = ~96 MB | Backpressure flows back to the watcher when the consumer can't drain. |
| Cross-peer trace continuity | 1 trace per playback session, regardless of peer count | W3C traceparent (above). |

**Idle eviction of remote consumers**: the existing 180s connection timeout (do NOT weaken — see [`docs/architecture/Streaming/04-Demand-Driven-Streaming.md`](../Streaming/04-Demand-Driven-Streaming.md)) applies to peer connections too. A peer that pauses playback for 4 minutes loses its slot and must reconnect, exactly like a local browser tab.

## 8. Invariants

The load-bearing rules. Each is enforced — or its enforcement seam is established — by the current server:

1. **Job ID is ephemeral; segment cache key is content-addressed.** The cache index from `(video_id, resolution, start_s, end_s)` to job ID exists in the chunker module. Eviction updates the index atomically with disk removal.
2. **Per-connection pull isolation.** Each `GET /stream/:jobId` connection holds its OWN watcher subscription / `mpsc` channel. A slow peer cannot stall the local user. ([`docs/architecture/Streaming/04-Demand-Driven-Streaming.md`](../Streaming/04-Demand-Driven-Streaming.md).)
3. **`RequestContext` middleware established before auth ships.** Every handler signature accepts `Extension<RequestContext>`; sharing fills in the `Identity` enum without adding a new function parameter.
4. **Identity DB is separate from cache DB.** Identity persists; cache is `tmp/`-class. ([`docs/architecture/Deployment/01-Packaging-Internals.md`](../Deployment/01-Packaging-Internals.md) §"Two-DB schema split".)
5. **Inbound `traceparent` is never stripped.** The middleware that extracts trace context must propagate it untouched into resolver context. Sharing makes it load-bearing for cross-peer trace continuity. ([`docs/architecture/Observability/01-Logging-Policy.md`](../Observability/01-Logging-Policy.md).)
6. **Invite token signature is verified server-side per request.** No caching of "this token is valid for the next N seconds" — every request reverifies. The `jti` nonce + a small bounded LRU of recently-accepted `jti` values is the replay-detection mechanism, not a cache.
7. **Token signature scope: scope is checked AGAINST the requested resource.** A `ShareScope::Video { video_id: V }` token cannot fetch a different video's segments, even if the requesting peer has a separate valid token for video V. The signature only binds the token to its issuing node and subject pubkey; the **resource match** is a per-handler check.
8. **W3C traceparent is the only cross-peer correlation mechanism.** No app-level request IDs or peer IDs in trace fields. The `peer_pubkey` is a span attribute, not a correlation key.
9. **Loopback is identifiable.** The middleware reliably tells a loopback request (`Identity::Local`, current behaviour) apart from a peer request. Practical mechanism: bind separately to `127.0.0.1` and to the configured peer interface; loopback gets `Local` regardless of headers, peer interface requires a verified token.
10. **Bind address and CORS allowlist are runtime-configurable.** The server does NOT hardcode `localhost:5173` in a CORS layer; both bind address and CORS allowlist come from `AppConfig` (see `server-rust/src/config.rs`).

## 9. Open questions — explicit non-decisions

These are deferred to the moment sharing is implemented; they do NOT block the Rust port.

1. **Token format**: `JWT (EdDSA)` vs. `base64(json + signature)` vs. a binary protobuf. JWT has the widest tooling; the custom format is more debuggable. Trade-off is wire size vs. legibility. Defer.
2. **Token revocation**: push (notify peer the token is dead — requires a back-channel) vs. pull (peers fetch a "revoked tokens" list periodically — requires polling). Likely **neither**: rely on short token lifetimes (e.g. 24h or 7d, user-configurable) and re-invite. Decide when revocation actually matters.
3. **Profile data shape**: what does "share my profile" mean? A name + avatar, or a library catalog with per-video share grants? Probably a profile = name + avatar + optional library access list. Defer to UX design.
4. **Discovery**: mDNS vs. user-supplied URL vs. relay. Likely all three, gated by setting. Defer.
5. **Per-peer rate limits**: a malicious peer with a valid token could DOS-pull segments. Unmistakable when it happens; complex to design proactively. Defer until observed.
6. **Whether peers can transcode on demand or only consume cached chunks**: simplest model is "cache only — peer's request kicks off an encode if needed, just like a local request, subject to the host's `MAX_CONCURRENT_JOBS` budget." This is the assumed default; the alternative (deny encodes to peers and serve only existing cache hits) is more conservative but rejects most first-time peer requests. Document the chosen behaviour when sharing ships.
7. **Cross-peer Seq endpoint configuration**: should node B's OTel exporter ship to node A's Seq? To node B's Seq? To both? Embedding a collector URL in the invite token is one option but introduces trust questions (peer A directs peer B's logs at an arbitrary URL). Likely the safe default is "each node ships to its own Seq; cross-peer correlation works because both sides have the same `trace_id`." Operators with a shared Seq pull from both nodes' streams. Defer.
8. **Self-signed TLS for LAN-direct**: cert pinning via fingerprint in the invite token works but is fragile across cert rotation. Alternatives: WebPKI for users with public DNS, ACME with a relay-hosted DNS. Defer to deployment design.
9. **Sharing scope at the GraphQL layer**: today every Relay query returns the full library. Sharing requires resolvers to filter by `request_context.identity.scope_grants(...)`. This is invasive across many resolvers; the alternative is a dedicated `query.sharedVideo(...)` / `query.sharedLibrary(...)` surface that bypasses the unscoped resolvers entirely. Decide when implementing.
10. **Nullable-fields for partial profiles**: a peer with a `Video` scope grant queries `library(id: ...)` — does the resolver return the library row or `null`? Today `null` semantically conflicts with "exists but you can't see it". Probably introduce a `not_authorized` error variant in the typed-error union; defer.

## Cross-references

- [`docs/architecture/Streaming/00-Protocol.md`](../Streaming/00-Protocol.md) — wire protocol that stays unchanged across sharing.
- [`docs/architecture/Streaming/04-Demand-Driven-Streaming.md`](../Streaming/04-Demand-Driven-Streaming.md) — per-connection pull isolation, idle timeout.
- [`docs/architecture/Streaming/06-FfmpegPool.md`](../Streaming/06-FfmpegPool.md) — content-addressed segment cache + ffmpeg pool.
- [`docs/architecture/Observability/01-Logging-Policy.md`](../Observability/01-Logging-Policy.md) — W3C traceparent threading + `RequestContext` extension shape.
- [`docs/architecture/Deployment/01-Packaging-Internals.md`](../Deployment/01-Packaging-Internals.md) — two-DB split (cache vs. identity), `app_cache_dir()` vs. `app_data_dir()` paths.
- [`docs/server/Config/00-AppConfig.md`](../../server/Config/00-AppConfig.md) — runtime-configurable bind address + CORS allowlist.
