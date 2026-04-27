# Sharing

Peer-to-peer media sharing across xstream instances. Each Tauri app is a node; users hand each other signed invite tokens out-of-band, and a remote node's React client streams from another node's Rust server using the same protocol it uses for its own.

This concept folder is **forward-looking** — sharing ships AFTER the Bun → Rust + Tauri migration. The docs here capture the design so the Rust port does not foreclose it. Forward constraints are also called out inline in each layer doc (`docs/migrations/rust-rewrite/01-Streaming-Layer.md`, `04-Web-Server-Layer.md`, `05-Database-Layer.md`, `06-File-Handling-Layer.md`); the doc here is the single authoritative place where they synthesise into a coherent system.

| File | Hook |
|---|---|
| [`00-Peer-Streaming.md`](00-Peer-Streaming.md) | Mental model (passthrough, not proxy), node identity (Ed25519 keypair + signed invite tokens), content-addressed cache reuse across peers, cross-peer W3C traceparent, concurrent-streams budget, invariants list, open questions. |
