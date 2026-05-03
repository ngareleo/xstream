# Release

Living working-document space for the post-redesign client. The
client-redesign migration retired in May 2026; this domain holds the
artefacts that outlived it.

## Contents

- [`Outstanding-Work.md`](Outstanding-Work.md) — every checklist item
  the migration carried as `unchecked` at retirement, grouped by
  component. Treat it as a starting audit (some items already shipped
  but were never re-ticked); verify against code before scheduling.

## Where the related material lives

- **Per-component design specs** (purpose, layout, behaviour, data) →
  [`docs/client/Components/`](../client/Components/). Authoritative
  reference for how each component looks and behaves today.
- **Tokens, grid, typography** →
  [`docs/design/UI-Design-Spec/`](../design/UI-Design-Spec/).
- **Code conventions** (Relay, Griffel, Nova, testing) →
  [`docs/code-style/`](../code-style/).

## When to update

- A `docs/release/Outstanding-Work.md` item ships → strike it through
  or remove it; if a corresponding spec under
  `docs/client/Components/` needs revision, edit the spec too.
- A new redesign sweep starts → add a section to `Outstanding-Work.md`
  and link it from this README. Don't reopen the (deleted) migration
  tree pattern.
