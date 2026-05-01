# AppHeader

> Status: **done** (Spec) · **not started** (Production) · last design change **2026-05-01** (PR #46 commit 558da06)

## Files

- `design/Release/src/components/AppHeader/AppHeader.tsx`
- `design/Release/src/components/AppHeader/AppHeader.styles.ts`
- Prerelease behavioural reference: `design/Prerelease/src/components/AppHeader/`

## Purpose

Top header strip — brand wordmark on the left, three centred navigation links, and a right cluster (icon-only scan button + avatar). Floats over the page content as a `position: absolute` layer inside [`AppShell`](AppShell.md). **The search form that previously lived here has moved to the Library/home page.** Because the header is absolute over whatever the page renders, the backdrop-filter blur now acts on real page content — most notably the Library hero's poster image ("poster behind glass").

## Visual

### Header shell

- **`position: absolute`, `top: 0`, `left: 0`, `right: 0`**, `height: tokens.headerHeight`, `zIndex: 10`.
- **Three-column grid:** `gridTemplateColumns: 1fr auto 1fr` — brand cell on the left (`1fr`), centred nav links (`auto`), right cluster (`1fr`).
- **Glass treatment:**
  - `backgroundImage: linear-gradient(180deg, rgba(20,28,24,0.55) 0%, rgba(8,11,10,0.78) 100%)`
  - `backgroundColor: rgba(8,11,10,0.62)` (fallback under the gradient)
  - `backdropFilter: blur(20px) saturate(1.6)` (+ `-webkit-` prefix)
  - `borderBottom: 1px solid rgba(37,48,42,0.45)` — soft division from main
  - `boxShadow: inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(0,0,0,0.18), 0 6px 22px rgba(0,0,0,0.42)` — top sheen + bottom shadow
- The header is no longer a grid row — it is `position: absolute` layered over the shell's `<main>`. The `backdrop-filter` blurs whatever the page has painted behind the header at y=0.

### Brand cell (left column)

- `paddingLeft: 24px`, `paddingRight: 24px`, `justifySelf: start`, `alignItems: center`.
- `<Link to="/">` with `aria-label="Xstream — home"`.
- Font: **Bytesized**, 34px, `letterSpacing: 0.04em`, `lineHeight: 1`.
- Two spans inside the link (inline-flex, `alignItems: baseline`):
  - `<span className={s.brandX}>X</span>` — `color: tokens.colorGreen`, `textShadow: 0 0 12px ${tokens.colorGreenGlow}`.
  - `<span className={s.brandWord}>stream</span>` — `color: tokens.colorText`.

### Nav links (centre column)

- Three `<NavLink>` elements: **Home** (`/`), **Profiles** (`/profiles`), **Watchlist** (`/watchlist`).
- Font: **Science Gothic**, 12px, `letterSpacing: 0.04em`, `text-transform: lowercase`. `paddingTop: 6px`, `paddingBottom: 6px`.
- `columnGap: 32px` between links, `justifySelf: center`.
- At rest: `color: tokens.colorTextDim`. Hover: `color: tokens.colorText` (transition `transitionProperty: color, text-shadow`).
- Active state (`navLinkActive`): `color: tokens.colorGreen` + `textShadow: 0 0 10px ${tokens.colorGreenGlow}`.
- `::after` pseudo-element underline (not `text-decoration`):
  - At rest: `transform: scaleX(0)`, `transformOrigin: center`.
  - Active: `transform: scaleX(1)`.
  - `content: ""`, `position: absolute`, `left: 0`, `right: 0`, `bottom: -2px`, `height: 2px`, `backgroundColor: tokens.colorGreen`.
  - The link container is `position: relative` to anchor the pseudo-element. `transitionProperty: transform`, `transitionDuration: tokens.transition`.
- `NavLink` `end` prop set for `/` so it does not stay active on child routes.

### Right cluster (right column)

- `justifySelf: end`, `alignSelf: center`, `paddingRight: 24px`.
- `display: flex`, `gap: 12px`, `alignItems: center`.

#### Scan button (icon-only)

- 38×38 `<button>` containing a 22×22 `<IconRefresh>` via a nested `<span className={s.scanIcon}>`.
- `backgroundColor: transparent`, no border, no outline, `paddingTop/Bottom/Left/Right: 0`.
- `color: tokens.colorTextMuted` at rest; hover: `color: tokens.colorGreen`, `textShadow: 0 0 6px green, 0 0 16px greenGlow` (transition `color, text-shadow`).
- `aria-label`: `"Scanning library"` while scanning, `"Scan library"` otherwise.
- `aria-busy={scanning}`.
- On click (`handleScan`): if already `scanning`, no-op. Else sets `scanning = true`, `window.setTimeout(() => setScanning(false), 2000)`.
- While `scanning`: `<span>` gets `scanIconSpinning` class — `animationName: { to: { transform: "rotate(360deg)" } }`, `1.1s`, `linear`, `infinite`.
- Production: replace the `setTimeout` with a `scanLibraries` mutation.

#### Avatar

- 34×34 button.
- `border-radius: 4px` on each corner.
- `background: linear-gradient(140deg, ${colorGreenDeep}, ${colorGreen})`, `color: tokens.colorGreenInk`, `font-weight: 700`.
- Displays `user.initials` (two-letter string).
- Same gradient + initials shape as the former Sidebar user-row avatar, now promoted to the header.

## Behaviour

### Nav active state

- Managed by React Router's `<NavLink>`. When a link is active, its CSS class receives the active variant which adds the `::after` underline and flips text colour to green.
- `/` link uses `end` prop so it does not stay active when on `/profiles` or `/watchlist`.

### Scan button click

- Calls `handleScan()`. If already `scanning`, no-op.
- Sets `scanning = true`, `setTimeout(() => setScanning(false), 2000)`.
- `<IconRefresh>` gets the spinning class.
- `aria-busy={scanning}` on the button.

## Tokens used

- `tokens.fontDisplay` — `"'Bytesized', system-ui, sans-serif"` (brand wordmark)
- `tokens.fontNav` — `"'Science Gothic', system-ui, sans-serif"` (nav links)
- `tokens.fontMono` — avatar initials font (700 weight, 12px)
- `tokens.headerHeight` — `"52px"` (header `height`)
- All display fonts loaded via Google Fonts in `design/Release/index.html`. The current `<link>` loads: Anton, Bytesized, Inter, JetBrains Mono, **Science Gothic** — `family=Science+Gothic:wght@400;500;600;700`. Bowlby One is **not** loaded.

## Accessibility

- Brand link: `aria-label="Xstream — home"`.
- Scan button: `aria-busy={scanning}`.
- Avatar button: `aria-label` for the user identity (e.g. `aria-label="Account — {user.initials}"`).
- Nav links: standard React Router `<NavLink>`; active state conveyed via colour change and `::after` underline (not `aria-current` override needed — NavLink sets it automatically).

## Porting checklist (`client/src/components/AppHeader/`)

- [ ] `position: absolute`, `top: 0`, `left: 0`, `right: 0`, `height: tokens.headerHeight` (`52px`), `zIndex: 10`
- [ ] Three-column grid: `gridTemplateColumns: 1fr auto 1fr`, `alignItems: center`
- [ ] Glass treatment: `backgroundImage: linear-gradient(180deg, rgba(20,28,24,0.55) 0%, rgba(8,11,10,0.78) 100%)`, `backgroundColor: rgba(8,11,10,0.62)`, `backdropFilter: blur(20px) saturate(1.6)` (+ `-webkit-` prefix), `borderBottom: 1px solid rgba(37,48,42,0.45)`, `boxShadow: inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(0,0,0,0.18), 0 6px 22px rgba(0,0,0,0.42)`
- [ ] Brand cell: `paddingLeft: 24px`, `paddingRight: 24px`, `justifySelf: start`
- [ ] Brand: `<Link to="/">` inline-flex `alignItems: baseline`, Bytesized 34px, `letterSpacing: 0.04em`; two spans: `<brandX>X</brandX>` in green with green-glow text-shadow, `<brandWord>stream</brandWord>` in `colorText`
- [ ] Brand link `aria-label="Xstream — home"`
- [ ] Three `<NavLink>` centred: Home `/` (with `end` prop), Profiles `/profiles`, Watchlist `/watchlist`
- [ ] Nav font: **Science Gothic**, 12px, `letterSpacing: 0.04em`, `text-transform: lowercase`, `paddingTop/Bottom: 6px`
- [ ] Nav at rest: `color: colorTextDim`; hover: `color: colorText`
- [ ] Nav active (`navLinkActive`): `color: colorGreen`, `textShadow: 0 0 10px colorGreenGlow`
- [ ] Nav `::after` (underline): `position: absolute`, `left/right: 0`, `bottom: -2px`, `height: 2px`, `backgroundColor: colorGreen`; `transform: scaleX(0)` at rest, `scaleX(1)` when active; `transformOrigin: center`; transition `transform 0.15s`
- [ ] `tokens.fontDisplay` (`'Bytesized'`) and `tokens.fontNav` (`'Science Gothic'`) registered in token file
- [ ] Google Fonts `<link>` in HTML `<head>` loads: Anton, Bytesized, Inter, JetBrains Mono, **Science Gothic** (not Bowlby One)
- [ ] Right cluster (`actionsCell`): `justifySelf: end`, flex row, `columnGap: 14px`, `paddingLeft: 24px`, `paddingRight: 24px`
- [ ] Scan button (`scanBtn`): 38×38, transparent bg, no border; contains `<span scanIcon><IconRefresh 22×22></span>`
- [ ] Scan icon (`scanIconSpinning`): `animationName: { to: rotate(360deg) }`, `1.1s`, `linear`, `infinite`
- [ ] `aria-busy={scanning}`, dynamic `aria-label`: `"Scanning library"` / `"Scan library"`
- [ ] Scan button wired to `scanLibraries` mutation (replaces 2s mock timer)
- [ ] Avatar: 34×34 button, `border-radius: 4px` all corners, `backgroundImage: linear-gradient(140deg, colorGreenDeep, colorGreen)`, `color: colorGreenInk`, fontMono 700 12px; hover: `translateY(-1px)` + `boxShadow: 0 4px 14px colorGreenSoft`
- [ ] No search form in the header (search is inside the Library/home hero)

## Changes from Prerelease

- **Position model:** OLD — `gridArea: head`, `position: sticky`, `top: 0`, part of the AppShell grid. NEW — `position: absolute`, `top: 0`, `left: 0`, `right: 0`, `height: 52px`, `zIndex: 10`; floats over the page content.
- **Layout:** OLD — brand cell (sidebar-width) + flex content slot (1fr) + actionsSlot (clip-path angled cutout). NEW — three-column grid `1fr auto 1fr` (brand left, nav centre, actions right). No clip-path cutout.
- **Brand identity:** OLD — `<LogoShield>` SVG + `"MORAN"` in Bebas Neue 21px, `letterSpacing: 0.12em`. NEW — `"Xstream"` in Bytesized 34px, `letterSpacing: 0.04em`, two spans (`<brandX>X</brandX>` green with green-glow, `<brandWord>stream</brandWord>` in colorText). `aria-label="Xstream — home"` on the `<Link>`.
- **Glass colour:** OLD — red glass: `linear-gradient(160deg, rgba(235,45,60,0.30) 0%, rgba(130,5,18,0.52) 100%)`, `backdropFilter: blur(28px) saturate(2.8) brightness(0.72)`, `borderBottom: 1px solid rgba(206,17,38,0.28)`. NEW — green glass: `linear-gradient(180deg, rgba(20,28,24,0.55) 0%, rgba(8,11,10,0.78) 100%)`, `backdropFilter: blur(20px) saturate(1.6)`, `borderBottom: 1px solid rgba(37,48,42,0.45)`.
- **Navigation:** OLD — no nav links in the header; navigation lived in the Sidebar. NEW — three centred `<NavLink>` elements (Home `/`, Profiles `/profiles`, Watchlist `/watchlist`) in Science Gothic 12px, lowercase, with `::after` underline pseudo-element (`scaleX(0)` → `scaleX(1)` on active). The `fontNav` token is `'Science Gothic', system-ui, sans-serif`.
- **Search form:** OLD — each page injected a search input into the header's `content` slot (Dashboard used `<LinkSearch>`, Library had its own search widget). NEW — no search form in the header at all. The Library/home page has its own ghost search bar inside the hero.
- **Scan button:** OLD — full-text "Scan All" button with icon in the `actionsSlot`. NEW — icon-only 38×38 `<button>` containing `<IconRefresh 22×22>`. Dynamic `aria-label`: `"Scanning library"` while scanning, `"Scan library"` otherwise.
- **Avatar:** OLD — user avatar lived in the Sidebar user-row (30×30). NEW — 34×34 gradient avatar button in the header right cluster. Same gradient (`linear-gradient(140deg, colorGreenDeep, colorGreen)`), same initials pattern.
- **Font tokens:** OLD — `fontHead: 'Bebas Neue'` for the brand. NEW — `fontDisplay: 'Bytesized'` (brand), `fontNav: 'Science Gothic'` (nav links). Anton (`fontHead`) is used in page-level display text, not the header.

## What changed from the prior spec (773681e → 558da06)

- **Nav font:** Bowlby One replaced by **Science Gothic** (commit `558da06`).
- **Nav font size:** remained **12px** (the 14px cited in the 773681e note was an intermediate value that did not land — source confirms 12px in the Science Gothic era).
- **Nav text-transform:** `"lowercase"` unchanged (still lowercase).
- `design/Release/index.html` updated to load `Science Gothic` (`family=Science+Gothic:wght@400;500;600;700`) instead of Bowlby One.
- `tokens.fontNav` value changed from `'Bowlby One'` to `'Science Gothic'`.

## What changed from the prior spec (5301df6 → 773681e)

- **Nav font:** Jersey 25 replaced by Bowlby One (this was superseded by 558da06 above — Science Gothic is the current state).
- **Nav font size:** 26px → 12px.
- **Nav text-transform:** `"lowercase"` added.
- `tokens.fontNav` value changed from `'Jersey 25'` to `'Bowlby One'` (then later to `'Science Gothic'`).
- Brand (Bytesized 34px) and all other header values unchanged.

## What changed from the prior spec (787f136 → 5301df6)

In 787f136 the header was a **grid row** in AppShell (`gridArea: head`, `position: relative`). In 5301df6:

- **`position` changed from `relative` to `absolute`**; `top: 0`, `left: 0`, `right: 0`, `height: tokens.headerHeight` — the header now floats over the page.
- **`gridArea: head` dropped** — AppShell no longer has a grid; the header is not a cell.
- The backdrop-filter now blurs real page content at y=0, not just the shell's background color. On the Library page, this produces the "poster behind glass" effect.

All other values (three-column grid, glass treatment, nav font/links, scan button, avatar) are unchanged from 787f136.

## Status

- [x] Designed in `design/Release` lab — full rewrite (2026-05-01, PR #46 commit 787f136). Converted from grid-row to `position: absolute` floating over page content (2026-05-01, PR #46 commit 5301df6). Nav font swapped to Bowlby One (2026-05-01, PR #46 commit 773681e). Nav font swapped again from Bowlby One to **Science Gothic** at 12px (2026-05-01, PR #46 commit 558da06). PR #46 on `feat/release-design-omdb-griffel`, not yet merged to main.
- [ ] Production implementation
