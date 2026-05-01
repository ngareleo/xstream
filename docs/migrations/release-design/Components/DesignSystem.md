# DesignSystem (page)

> Status: **baseline** (Spec) · **n/a — lab only** (Production)

## Files

- `design/Release/src/pages/DesignSystem/DesignSystem.tsx` (no `.styles.ts` — inline)

## Purpose

Live single-page showcase (`/design-system`) of the Xstream visual language: color tokens, type scale, spacing scale, all 7 candidate logos, app-icon contexts, header lockup. Used to:
- Pick the final logo by reviewing all 7 marks in `LogoCard` frames side-by-side.
- Sanity-check token values against actual rendered swatches.
- Document the design system inline so reviewers don't need to read source.

**This page is intentionally NOT ported to production** — it's a lab tool. The spec exists only so a future agent doesn't accidentally port it.

## Visual

### Outer container (`.shell`)
- `height: 100%`, `overflowY: auto`, `boxSizing: border-box`.
- **`paddingTop: calc(${tokens.headerHeight} + 32px)`**, `paddingBottom: 80px`, `paddingLeft: 40px`, `paddingRight: 40px` — the page is responsible for its own header clearance (32px gap below the header).

### Header
- Eyebrow: `DESIGN SYSTEM · /design-system` in green.
- Title: Anton 56px, `letter-spacing: -0.01em`, `line-height: 0.92` — `"Xstream — visual language."`.
- Body: max-width 720px, `color: var(--text-dim)`, `line-height: 1.6`. Includes `<code>` references to `Logo02` + `components/Logo/index.tsx` + `AppHeader brand glyph` for the selection workflow.

### Sections (`<Section label="T-XX" title="...">`)
- Section header lays out a label badge (e.g. `T-01`) + section title.
- Sections include:
  - **T-01 Color tokens**: grid `repeat(auto-fill, minmax(180px, 1fr))`, gap 12. Per-token swatch with name, var, hex/oklch, role.
  - **T-02 Type scale**: Anton / Inter / JetBrains Mono samples at marquee sizes.
  - **T-03 Spacing scale**: 4 / 8 / 12 / 16 / 24 / 32 horizontal bars.
  - **L-01..L-07 Logo candidates**: renders `<LogoCard>` per [LOGOS array](Logo.md), `MK-02` highlighted as default.
  - **C-01 App icon context**: 64 / 96 / 128px size variants.
  - **C-02 Header lockup**: shows the AppHeader brand glyph in context.

### `COLORS` array (top of file)
12 entries: `[name, varRef, literal, role]`. Currently includes bg-0, bg-1, surface, surface-2, border, green, green-deep, text, text-dim, text-muted, text-faint, yellow.

## Behaviour

- Read-only scrollable surface. No state, no animations, no URL params.
- Logo selection: when the user picks a final mark, the `highlighted` predicate (`entry.code === "MK-02"`) needs to be updated.

## Subcomponents

### `Section` helper (inline)
- Renders the label badge + title + children block. (Source: lines after the `COLORS` array.)

## Changes from Prerelease

No Prerelease counterpart — the DesignSystem page is new in the Release redesign. Prerelease had no `/design-system` route and no equivalent design-token showcase tool.

Cross-reference: [`Changes.md`](../Changes.md) — "DesignSystem — new in Release".

## TODO(redesign)

- The "selection" workflow is informal — clicking a `LogoCard` doesn't change the highlighted entry. Could become an interactive picker that writes to a localStorage flag, with a "Promote to default" button that updates the export.
- The `SPACING` constants are duplicated (here + in tokens.ts). Source from a single place.
- Add a token-vs-sample diff helper so the swatches catch drift between `tokens.ts` and `shared.css`.

## Porting checklist

**This page does NOT port to production.** It exists only in the lab.

If a future agent decides part of this should ship (e.g. as an internal docs page), break it into a separate decision and update this status row.

## Status

- [x] Designed in `design/Release` lab — baseline reflects prior state; `.shell` gains `paddingTop: calc(headerHeight + 32px), boxSizing: border-box` for positioned-shell header clearance (2026-05-01, PR #46 commit 5301df6, `feat/release-design-omdb-griffel`, not yet merged to main)
- [ ] Production implementation — **n/a, lab only**
