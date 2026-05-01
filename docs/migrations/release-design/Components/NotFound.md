# NotFound (page)

> Status: **baseline** (Spec) · **not started** (Production)

## Files

- `design/Release/src/pages/NotFound/NotFound.tsx`
- `design/Release/src/pages/NotFound/NotFound.styles.ts`
- Prerelease behavioural reference: `design/Prerelease/src/pages/NotFound/`

## Purpose

404 inside the app shell (`*` route). Renders **inside** [`AppShell`](AppShell.md) (sidebar + header still visible) — so it's a centred message, not a full-bleed atmospheric like [`Goodbye`](Goodbye.md).

## Visual

### Outer container (`.shell`)
- `height: 100%`, `position: relative`, `overflow: hidden`, `backgroundColor: colorBg0`.
- `display: flex`, centred (both axes).
- **`paddingTop: tokens.headerHeight`, `boxSizing: border-box`** — the page is responsible for its own header clearance, so the centred 404 content stays roughly mid-viewport (not hidden behind the header).

### Layered atmosphere (bottom to top)
1. `.grain-layer` utility, `opacity: 0.2`.
2. Radial green glow: `radial-gradient(ellipse at center, var(--green-soft) 0%, transparent 60%)`, `pointer-events: none`.
3. **Ghost numeral**: `font-size: 32vw`, Anton, `opacity: 0.04`, `letter-spacing: -0.04em`, content `"404"`. `aria-hidden`, no select/pointer.

### Centred content (z-index: 2, padding: 24)
- Eyebrow `· NOT FOUND` in green.
- Display title: Anton 64px, `letter-spacing: -0.01em`, uppercase — `"Nothing here."`.
- Body line: `color: var(--text-dim)`, max-width 460, `margin-top: 8`, `margin-inline: auto` — `"The page you tried to reach has moved or never existed. Head back to the library to keep browsing."`.
- Action row (`margin-top: 22`, gap 12, centred):
  - **Go back button**: transparent bg, `border: 1px solid var(--border)`, `color: var(--text-dim)`, JetBrains Mono 11 / 0.18em / uppercase, `border-radius: 2px`, `padding: 10px 18px`. `<IconBack> Go back`. Calls `navigate(-1)`.
  - **Browse library link**: `<Link to="/">` styled as primary CTA — `background: var(--green)`, `color: var(--green-ink)`, no border, JetBrains Mono uppercase 11 / 700. `<IconSearch> Browse library`.

## Behaviour

- `navigate(-1)` on Go back.
- `<Link to="/">` on Browse library (note: copy says "library" but href is `/`, the Profiles page — TODO).

## Subcomponents

None.

## Changes from Prerelease

- **Header clearance:** OLD — NotFound rendered its own `<AppHeader>` then a `.main` container (required by the Prerelease grid model). NEW — header is provided by `<AppShell>`; NotFound adds `paddingTop: tokens.headerHeight, boxSizing: border-box` to its own `.shell` container.
- **Title copy:** OLD — `"Page not found"`. NEW — `"Nothing here."`.
- **Body copy:** OLD — `"The page you're looking for doesn't exist or has been moved."`. NEW — `"The page you tried to reach has moved or never existed. Head back to the library to keep browsing."`.
- **Ghost numeral style:** OLD — the `"404"` ghost was styled via a `code`-style element with the Prerelease heading font (Bebas Neue). NEW — `font-size: 32vw`, Anton, `opacity: 0.04`, `letter-spacing: -0.04em`, `aria-hidden`, no-select — a full atmospheric watermark.
- **Atmospheric layers:** OLD — grain + radial gradient background (present in Prerelease). NEW — grain + radial green-soft glow (same structure, green accent replaces any red).
- **Colour identity:** OLD — "Browse library" CTA button had red background. NEW — green background (`background: var(--green)`, `color: var(--green-ink)`). Go back button: unchanged (transparent + 1px border + dim text).
- **"Browse library" href:** OLD — `<Link to="/library">`. NEW — `<Link to="/">` — because `/library` no longer exists (home is now `/`). Copy still reads "Browse library" — noted as a TODO.
- **Route and shell:** Identical — `*` catch-all inside AppShell in both labs.

## TODO(redesign)

- "Browse library" copy + icon (`IconSearch`) say library but the link points to `/` (Profiles). Either change the copy to "Browse profiles" or change the href to `/library` to match.
- Could add a search input directly on the 404 page so users can recover by searching.

## Porting checklist (`client/src/pages/NotFound/`)

- [ ] Renders inside AppShell (not full viewport like Goodbye)
- [ ] `.shell`: `paddingTop: tokens.headerHeight`, `boxSizing: border-box` (page manages header clearance so the 404 stays mid-viewport)
- [ ] Grain layer at 0.2 opacity
- [ ] Radial green-soft glow centred
- [ ] Ghost "404" at 32vw / 0.04 opacity / Anton
- [ ] Centred eyebrow `· NOT FOUND` in green
- [ ] Display title Anton 64px uppercase — `"Nothing here."`
- [ ] Body line max-width 460
- [ ] Go back button: transparent + 1px border + Mono uppercase, `navigate(-1)`
- [ ] Browse library link: green bg + green-ink text + Mono uppercase 700
- [ ] Reconcile "Browse library" copy/href mismatch (currently points to `/`)

## Status

- [x] Designed in `design/Release` lab — baseline reflects prior state; `.shell` gains `paddingTop: tokens.headerHeight, boxSizing: border-box` for positioned-shell header clearance (2026-05-01, PR #46 commit 5301df6, `feat/release-design-omdb-griffel`, not yet merged to main)
- [ ] Production implementation
