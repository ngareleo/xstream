# UI Design Spec

Authoritative tokens, type scale, spacing, and structural UX contracts
for the xstream client.

| File | Hook |
|---|---|
| [`00-Tokens-And-Layout.md`](00-Tokens-And-Layout.md) | Token map, type scale, spacing, geometry, behavioural contracts (pane routing, drag-resize, Player state machine, inactivity hide), logo-selection state, page-route map. |

The visual reference prototype lives at `design/Release/` — boot it with
`bun run design` from the repo root (port `5001`).

Per-component design specs (layout, behaviour, data wiring) live in
[`docs/client/Components/`](../../client/Components/README.md).
Outstanding redesign work is tracked in
[`docs/release/Outstanding-Work.md`](../../release/Outstanding-Work.md).
