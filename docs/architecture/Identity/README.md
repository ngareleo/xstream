# Identity

Supabase-backed password auth wired so OTel events on both sides carry a verified `user.id`. The Rust server runs in-process inside the user's Tauri shell — server-side JWT validation is for **identity correlation**, not access control. Forward-compatible with peer sharing (`RequestContext.peer_node_id` + `share_grant`) which will layer authorization on top.

| File | Hook |
|---|---|
| [`00-System-Overview.md`](00-System-Overview.md) | Why Supabase, the in-process server framing, what stays out of the bundle, alpha vs. forward gates. |
| [`01-Sign-In-Flow.md`](01-Sign-In-Flow.md) | Signin / signup / reset / change-password / sign-out sequences. JWT handshake from client → server. |
| [`02-Session-And-Refresh.md`](02-Session-And-Refresh.md) | Token lifecycle, auto-refresh, offline, JWKS unreachable, known gaps (WS subscription auth). |
| [`03-Telemetry-Correlation.md`](03-Telemetry-Correlation.md) | How `user.id` lands on server spans and client log records — the load-bearing alpha outcome. |
