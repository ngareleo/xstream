# AppHeader

> Status: **done** (Spec) · **not started** (Production) · last design change **2026-05-01** (PR #46 commit 5301df6)

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

- `paddingLeft: 24px`, `justifySelf: start`, `alignSelf: center`.
- `<Link to="/">` with `aria-label="Xstream — home"`.
- Font: **Bytesized**, 34px.
- Two spans: the brand wordmark rendered in the Bytesized typeface at `color: var(--text)`. (The prior green `X` / `stream` split has been consolidated into a single wordmark.)

### Nav links (centre column)

- Three `<NavLink>` elements: **Home** (`/`), **Profiles** (`/profiles`), **Watchlist** (`/watchlist`).
- Font: **Jersey 25**, 26px.
- `gap: 32px` between links (or equivalent).
- At rest: `color: var(--text-muted)`.
- Active state: `color: var(--green)` + `::after` pseudo-element underline (not `text-decoration`).
  - `::after`: `content: ""`, `position: absolute`, `bottom: -4px` (approx), `left: 0`, `right: 0`, `height: 2px`, `backgroundColor: var(--green)`.
  - The link container is `position: relative` to anchor the pseudo-element.
- `NavLink` `end` prop set for `/` so it does not stay active on child routes.

### Right cluster (right column)

- `justifySelf: end`, `alignSelf: center`, `paddingRight: 24px`.
- `display: flex`, `gap: 12px`, `alignItems: center`.

#### Scan button (icon-only)

- 22×22 `<IconRefresh>`, wrapped in a `<button>`.
- `backgroundColor: transparent`, no border, no outline.
- `color: var(--text-muted)` at rest; `color: var(--green)` on hover.
- On click: sets `scanning = true`, `setTimeout(() => setScanning(false), 2000)`.
- While `scanning`: icon gets a spinning animation (`animationName: { to: { transform: "rotate(360deg)" } }`, 1.1s linear infinite) for approximately 2s.
- `aria-busy={scanning}`.
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
- `tokens.fontNav` — `"'Jersey 25', system-ui, sans-serif"` (nav links)
- Both fonts loaded via Google Fonts in `design/Release/index.html`.

## Accessibility

- Brand link: `aria-label="Xstream — home"`.
- Scan button: `aria-busy={scanning}`.
- Avatar button: `aria-label` for the user identity (e.g. `aria-label="Account — {user.initials}"`).
- Nav links: standard React Router `<NavLink>`; active state conveyed via colour change and `::after` underline (not `aria-current` override needed — NavLink sets it automatically).

## Porting checklist (`client/src/components/AppHeader/`)

- [ ] `position: absolute`, `top: 0`, `left: 0`, `right: 0`, `height: tokens.headerHeight`, `zIndex: 10`
- [ ] Three-column grid: `1fr auto 1fr`
- [ ] Glass treatment: gradient + backdrop-filter + inner highlight + drop shadow (same values as prior spec)
- [ ] Brand cell left-aligned, `paddingLeft: 24px`, Bytesized 34px font
- [ ] Brand link `aria-label="Xstream — home"` as a `<Link to="/">`
- [ ] Three `<NavLink>` centred: Home `/` (with `end`), Profiles `/profiles`, Watchlist `/watchlist`
- [ ] Nav font: Jersey 25, 26px
- [ ] Nav active: `color: var(--green)` + `::after` pseudo-element underline (not `text-decoration`)
- [ ] Nav `::after` anchored by `position: relative` on the link container; `bottom: -2px`
- [ ] `tokens.fontDisplay` (`'Bytesized'`) and `tokens.fontNav` (`'Jersey 25'`) registered in token file
- [ ] Both Google Fonts loaded in HTML `<head>` (Bytesized + Jersey 25)
- [ ] Right cluster: `justifySelf: end`, flex row, `columnGap: 14px`, `paddingRight: 24px`
- [ ] Scan button: 38×38 hit target wrapping 22×22 `<IconRefresh>`, icon-only, transparent bg, no border
- [ ] Scan icon spins (~2s) on click while `scanning`; `aria-busy` toggled
- [ ] Scan button wired to `scanLibraries` mutation (replaces 2s mock timer)
- [ ] Avatar: 34×34 button, `border-radius: 4px`, green-deep→green gradient, green-ink initials (Mono 700 12px)
- [ ] No search form in the header (search moved to Library/home page)

## What changed from the prior spec (787f136 → 5301df6)

In 787f136 the header was a **grid row** in AppShell (`gridArea: head`, `position: relative`). In 5301df6:

- **`position` changed from `relative` to `absolute`**; `top: 0`, `left: 0`, `right: 0`, `height: tokens.headerHeight` — the header now floats over the page.
- **`gridArea: head` dropped** — AppShell no longer has a grid; the header is not a cell.
- The backdrop-filter now blurs real page content at y=0, not just the shell's background color. On the Library page, this produces the "poster behind glass" effect.

All other values (three-column grid, glass treatment, nav font/links, scan button, avatar) are unchanged from 787f136.

## Status

- [x] Designed in `design/Release` lab — full rewrite (2026-05-01, PR #46 commit 787f136). Converted from grid-row to `position: absolute` floating over page content (2026-05-01, PR #46 commit 5301df6). PR #46 on `feat/release-design-omdb-griffel`, not yet merged to main.
- [ ] Production implementation
