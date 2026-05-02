# Migrations

Time-bounded migration projects that span multiple existing domains. Each subfolder is one migration effort; its README summarises scope, status, and links to the layer-by-layer docs inside.

Migrations are bounded by definition — once an effort lands, its docs either retire (replaced by the new normal in the architecture/ + client/ + server/ tree) or are kept as a historical reference. They are NOT a permanent home for any concept; cross-cutting concepts that survive a migration belong in `architecture/`. Cross-cutting policy that future ports inherit (e.g. the "tests travel with the port" rule) lives in [`docs/code-style/`](../code-style/README.md).

## Active migrations

| Folder | Hook |
|---|---|
| [`release-design/`](release-design/README.md) | Prerelease (Moran) → Release (Xstream) client redesign. Per-component spec + porting checklist; visuals live in `design/Release/`, this folder is the portable spec. |
