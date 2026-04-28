# Migrations

Time-bounded migration projects that span multiple existing domains. Each subfolder is one migration effort; its README summarises scope, status, and links to the layer-by-layer docs inside.

Migrations are bounded by definition — once an effort lands, its docs either retire (replaced by the new normal in the architecture/ + client/ + server/ tree) or are kept as a historical reference. They are NOT a permanent home for any concept; cross-cutting concepts that survive a migration belong in `architecture/`.

## Active migrations

| Folder | Hook |
|---|---|
| [`rust-rewrite/`](rust-rewrite/README.md) | Bun → Rust + Tauri desktop port. Layer-by-layer deep-dives, stable contracts, phased migration order, packaging + signing. |
