# UI Design Specification

The xstream visual identity: green `oklch(0.78 0.20 150)` accent + Anton /
Inter / JetBrains Mono. Authoritative for tokens, type scale, spacing,
geometry, and the structural UX contracts (URL-based pane state,
drag-resize, Player state machine, inactivity hide).

The canonical visual reference is the React prototype at `design/Release/`
(run with `cd design/Release && bun dev` — port `5001`, or
`bun run design` from the repo root).

## Source assets

The design lab was bootstrapped from the Figma handoff at
`/home/dag/Downloads/XStream Figma Board.html`. Companion files (also in
`/home/dag/Downloads/`):

| File | Role |
|---|---|
| `XStream Figma Board.html` | Section layout, token map, type scale, spacing |
| `app-mockups.jsx` | Authoritative Profiles / Library / Player markup |
| `logos.jsx` | The 7 candidate logo SVGs |
| `xstream proto 2.zip` | 4 atmospheric backdrops (`atmos-1..4.jpg`) |

The Figma board's `data-c` color attributes drive
`design/Release/src/styles/tokens.ts` and `shared.css`.

---

## Pages and routes

| Route | Component | Shell |
|---|---|---|
| `/` | Library | AppShell |
| `/profiles` | Profiles | AppShell |
| `/profiles/new` | CreateProfile | AppShell |
| `/profiles/:id/edit` | EditProfile | AppShell |
| `/watchlist` | Watchlist | AppShell |
| `/settings` | Settings | AppShell |
| `/player/:filmId` | Player | Full-screen (no shell) |
| `/goodbye` | Goodbye | Full-screen (no shell) |
| `/error` | Error | AppShell |
| `*` | NotFound | AppShell |

The Player and Goodbye pages bypass the AppShell. Every other page renders
inside the shell (header strip + main).

---

## Tokens

All values are declared as CSS custom properties on `:root` in
`design/Release/src/styles/shared.css` AND mirrored as typed constants in
`design/Release/src/styles/tokens.ts` so Griffel `makeStyles()` can
reference either. The two sources are kept in lockstep manually — when
adding a token, update both.

| Token | Value | Usage |
|---|---|---|
| `--bg-0` | `#050706` | App ink (the deepest layer) |
| `--bg-1` | `#0a0d0c` | Header / sidebar / panels behind cards |
| `--surface` | `#14181a` | Standard panel surface |
| `--surface-2` | `#1a1f1c` | Card / input surface |
| `--border` | `#25302a` | Dividers, control borders |
| `--border-soft` | `rgba(37,48,42,0.5)` | Internal subdivisions |
| `--green` | `oklch(0.78 0.20 150)` | Primary accent |
| `--green-deep` | `oklch(0.45 0.13 150)` | Hover / pressed accent |
| `--green-soft` | `oklch(0.78 0.20 150 / 0.12)` | Selection highlights |
| `--green-glow` | `oklch(0.78 0.20 150 / 0.35)` | Drop-shadow rim around play head |
| `--green-ink` | `#050706` | Text on green chips/buttons |
| `--text` | `#e8eee8` | Foreground |
| `--text-dim` | `#9aa6a0` | Body |
| `--text-muted` | `#6a766f` | Secondary labels |
| `--text-faint` | `#46504b` | Eyebrow / footnotes |
| `--yellow` | `#f5c518` | IMDb badges, unmatched warnings |
| `--red` | `#ff5d6c` | Danger-zone destructive actions |
| `--font-head` | `'Anton'` | Display titles, hero greeting |
| `--font-body` | `'Inter'` | All UI text |
| `--font-mono` | `'JetBrains Mono'` | Eyebrow labels, file metadata, code |

## Type scale

| Step | Family | Size | Use |
|---|---|---|---|
| Display | Anton | 56–80 | Hero greeting, page titles, marquee |
| Title | Anton | 24–40 | Section heads, "Now Playing" |
| Body | Inter | 12–14 | Table rows, chip labels, card text |
| Eyebrow | JetBrains Mono | 9–11 (uppercase, 0.18em letter-spacing) | Mode labels, breadcrumbs, file metadata |

## Spacing scale

`4 / 8 / 12 / 16 / 24 / 32` (px). Surface above 32px should use multiples
of 8 ad-hoc — beyond the scale.

## Geometry

Radii are deliberately tight: `2px` (chips, buttons), `4px` (cards,
panels), `999px` (avatars, profile chips, status dots). Xstream avoids
`8px+` corner radii — the technical / archival mood the JetBrains Mono
eyebrows establish breaks under softer edges.

---

## Behavioural contracts

- **Pane routing** — `?film=<id>` on Library and Profiles. Single param
  drives the right-side detail pane.
- **Toggle/deselect** on second click of the row that opened the pane.
- **Split-body grid** — `1fr 0px 0px` closed, `1fr 4px <pane>px` open;
  drag-resize via `useSplitResize`.
- **Player state machine** — `idle → loading → playing → ended`.
- **Inactivity hide** — 3000 ms timer for player chrome auto-hide,
  suppressed while `idle`.
- **Navigation rules** — `<Link>` for Play, `navigate(-1)` for Back.
- **Settings deep-link** — `?section=<id>` selects the tab.

## Logo selection (open)

The Figma board ships **seven** candidate marks (`L-01..L-07`). The
current working default is **Logo02** (the stacked-X monogram in
`design/Release/src/components/Logo/Logo02.tsx`) because it appears in
the Figma's C-01 app-icon frame. All seven are rendered for live review
at `/design-system`.

When a final is picked:
1. Update `LOGOS[].highlighted` selection in
   `design/Release/src/components/Logo/index.tsx`.
2. Replace the wordmark-only AppHeader brand with a Logo01-style lockup
   if the chosen mark is glyph + wordmark.
3. Remove the rejected `LogoNN.tsx` files.

---

## Component specs

Per-component design specs (style, layout, behaviour, data wiring) live
in [`docs/client/Components/`](../../client/Components/README.md).
Outstanding redesign work is tracked in
[`docs/release/Outstanding-Work.md`](../../release/Outstanding-Work.md).
