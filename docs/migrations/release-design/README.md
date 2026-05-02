# Release-Design Migration

Migrate the xstream client from the **Prerelease** identity (codename Moran — red `#CE1126`, Bebas Neue display) to the **Release** identity (codename Xstream — green `oklch(0.78 0.20 150)`, Anton + Inter + JetBrains Mono). The visual + behavioural prototype lives in [`design/Release/`](../../../design/Release/); this folder is the **portable spec** that travels with the port to production (`client/src/`).

## Why a migration

- **The lab is not portable.** Tokens, animation timings, URL contracts, state machines, and accessibility attrs all live only in the `.tsx` and `.styles.ts` of `design/Release/`. Porting to production becomes a re-derivation.
- **A spec doc is portable.** One `.md` per UI element with a porting checklist turns a re-derivation into a tick-the-boxes exercise.
- **Time-bounded.** Per [`docs/migrations/README.md`](../README.md), migrations exist until the work lands. Once every Release component ships in `client/src/`, this folder retires.

## Reading order

1. This README — scope + contract.
2. [`Components/README.md`](Components/README.md) — catalog + status table for every component.
3. The individual `Components/<Name>.md` for the element you're touching.

## Status

Documentation updated via PR #46 audit (2026-05-01), PR #48 sync (2026-05-02, hero modes + SearchSlide + FilterSlide TUI panels + component decomposition). 

**Spec completion:**
- **`done`** (7 components): **AppShell**, **AppHeader**, **AccountMenu**, **EdgeHandle**, **Library**, **Watchlist**, **Player** — fully fleshed, zero `TODO(redesign)` placeholders.
- **`baseline`** (21 components): all values visible in source; open design questions marked `TODO(redesign)`.
- **Lab-only** (2 components, `n/a` production status): **DevPanel**, **DesignSystem**.

**Recently added** (2026-05-02, PR #48):
- **Eight extracted components:** SearchSlide, FilterSlide, PosterRow, FilmTile, FilmDetailsOverlay (from Library); ProfileRow, FilmRow (from Profiles). Each now has its own `.tsx` + `.styles.ts` in the design lab and a dedicated `.md` spec with porting checklist. Parent pages (Library, Profiles) became thin shells (~160–260 lines) delegating to extracted components. Shared `PROFILE_GRID_COLUMNS` constant (`pages/Profiles/grid.ts`) locks column widths across ProfileRow and FilmRow.
- **Earlier:** DirectoryBrowser (popover for ProfileForm), DevPanel (lab-only QA nav), Error (runtime-error page).

**Implementation in production:** not started (all specs are design-lab first; porting begins once a spec is `done` or clearly marked `baseline` with knowns only).

## Links

- [`design/Release/`](../../../design/Release/) — the prototype lab. **Visuals are authoritative here.** When the spec disagrees, the lab wins (and the spec gets updated).
- [`design/Prerelease/`](../../../design/Prerelease/) — the frozen Moran prototype. Behavioural reference for any contract not re-stated in the Release spec (URL pane state, drag-resize, Player state machine, inactivity hide all port verbatim).
- [`docs/design/UI-Design-Spec/01-Release-Tokens-And-Layout.md`](../../design/UI-Design-Spec/01-Release-Tokens-And-Layout.md) — token map + page-by-page status, lives outside this migration because tokens survive past the port.
- [`client/src/`](../../../client/src/) — the port target.
- [`Changes.md`](Changes.md) — cross-cutting diff of every meaningful design change between Prerelease and Release. Start here when you need a high-level orientation before reading individual component specs.

## Contract

Two directions, both enforced by the `migrations-lead` agent:

**Editing `design/Release/**`** ⇒ in the same session, update the matching `Components/<Name>.md` so the spec stays in lockstep with the lab. Fill in `TODO(redesign)` placeholders with the new value when one becomes known. Date the section. If a behavioural change broke a contract a previous session pinned, surface it before silently rewriting.

**Implementing a component in `client/src/`** ⇒ tick the porting checklist on the matching spec file as each detail lands. Mark the catalog Production status row when the component ships.

`design/Prerelease/**` is **not** in this migration — Prerelease is frozen and edits there go to `architect` per the default routing.

## Status conventions

Per-component spec status: `not started` → `baseline` (reflects current lab state, redesign pending) → `done` (matches a confirmed Release-identity design).

Per-component production status: `not started` → `in progress` → `done`. Or `n/a — lab only` for elements like the DesignSystem page that exist purely as a design tool.
