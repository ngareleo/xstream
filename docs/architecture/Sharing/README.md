# Sharing

Peer-to-peer media sharing across xstream instances. Each Tauri app is a node; users hand each other signed invite tokens out-of-band, and a remote node's React client streams from another node's Rust server using the same protocol it uses for its own.

This concept folder is **forward-looking** — sharing is a future enhancement to the Rust + Tauri server. The docs here capture the design constraints and invariants. The doc here is the single authoritative place where peer-streaming patterns synthesise into a coherent system.

| File | Hook |
|---|---|
| [`00-Peer-Streaming.md`](00-Peer-Streaming.md) | Mental model (passthrough, not proxy), node identity (Ed25519 keypair + signed invite tokens), content-addressed cache reuse across peers, cross-peer W3C traceparent, concurrent-streams budget, invariants list, open questions. |
