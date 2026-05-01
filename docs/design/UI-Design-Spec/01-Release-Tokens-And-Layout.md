# UI Design Specification — Release (Xstream identity)

> **Era status:** active. This is the post-redesign **Xstream** identity
> (green `oklch(0.78 0.20 150)` accent + Anton / Inter / JetBrains Mono).
> The previous **Moran** identity is frozen at
> [`00-Prerelease-Tokens-And-Layout.md`](00-Prerelease-Tokens-And-Layout.md).

The canonical design reference is the React prototype at `design/Release/`
(run with `cd design/Release && bun dev` — port `5001`, or
`bun run design` from the repo root to boot both eras together). All structural UX
contracts (URL-based pane state, drag-resize, Player state machine, inactivity
hide) are direct ports from the Prerelease spec — only the visual treatment
changed.

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

The Figma board's `data-c` color attributes drive `design/Release/src/styles/tokens.ts` and `shared.css`.

---

## Pages and routes

| Route | Component | Shell |
|---|---|---|
| `/` | Profiles | AppShell |
| `/library` | Library | AppShell |
| `/settings` | Settings | AppShell |
| `/design-system` | DesignSystem (tokens + 7 logos + context frames) | AppShell |
| `/player/:filmId` | Player | Full-screen (no shell) |
| `/goodbye` | Goodbye | Full-screen (no shell) |
| `*` | NotFound | AppShell |

The Player and Goodbye pages bypass the sidebar + header shell. Every other
page renders inside the two-column AppShell grid (220px sidebar + 1fr main),
identical to Prerelease.

---

## Tokens

All values are declared as CSS custom properties on `:root` in
`design/Release/src/styles/shared.css` AND mirrored as typed constants in
`design/Release/src/styles/tokens.ts` so Griffel `makeStyles()` can reference
either. The two sources are kept in lockstep manually — when adding a token,
update both.

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

`4 / 8 / 12 / 16 / 24 / 32` (px). Surface above 32px should use multiples of
8 ad-hoc — beyond the scale.

## Geometry

Radii are deliberately tight: `2px` (chips, buttons), `4px` (cards, panels),
`999px` (avatars, profile chips, status dots). Unlike Moran, Xstream avoids
`8px+` corner radii — the technical / archival mood the JetBrains Mono
eyebrows establish breaks under softer edges.

---

## Behavioral parity with Prerelease

The following contracts port verbatim — see the corresponding sections of
[`00-Prerelease-Tokens-And-Layout.md`](00-Prerelease-Tokens-And-Layout.md) for
full prose:

- **Pane routing** — `?film=<id>` on Library, `?film=<id>` on Profiles
  (simplified from Prerelease's `?pane=film-detail&filmId=<id>` because the
  Figma JSX uses a single param).
- **Toggle/deselect** on second click.
- **Split-body grid** — `1fr 0px 0px` closed, `1fr 4px <pane>px` open;
  `useSplitResize` ports unchanged.
- **Player state machine** — `idle → loading → playing`; same transitions.
- **Inactivity hide** — 3000 ms timer, suppressed while `idle`.
- **Navigation rules** — `<Link>` for Play, `navigate(-1)` for Back.
- **Settings deep-link** — `?section=<id>` selects the tab.

## Visual deltas from Prerelease

What changes when porting an existing component:

1. **Red → green** on every accent surface: action buttons, badges,
   selection borders, glow rims. The new accent is `oklch`, not hex —
   prefer `var(--green)` over inline values so the entire ramp updates if
   the tone is re-tuned.
2. **Bebas Neue → Anton** on display + title. Both are condensed sans, but
   Anton has a tighter letter spacing — most copy looks correct without
   adjustment, but very large hero text benefits from `letter-spacing: -0.01em`.
3. **EYEBROW labels** are now mandatory in JetBrains Mono uppercase with
   `letter-spacing: 0.18em`. The `.eyebrow` utility class in `shared.css`
   provides this.
4. **Match bar** is unchanged (yellow when `unmatched > 0`); Player
   "On disk" / "Not on disk yet" still uses green vs muted.
5. **Chip styling** is sharper — `--radius-sm: 2px` instead of `4px`;
   green chips use `--green-soft` background with `--green-deep` border.

## Logo selection (open)

The Figma board ships **seven** candidate marks (`L-01..L-07`). The current
working default is **Logo02** (the stacked-X monogram in
`design/Release/src/components/Logo/Logo02.tsx`) because it appears in the
Figma's C-01 app-icon frame. All seven are rendered for live review at
`/design-system`.

When a final is picked:
1. Update `LOGOS[].highlighted` selection in
   `design/Release/src/components/Logo/index.tsx`.
2. Replace the wordmark-only AppHeader brand with a Logo01-style lockup if
   the chosen mark is glyph + wordmark.
3. Remove the rejected `LogoNN.tsx` files.

---

## Status of pages (porting cursor)

| Page | Status | Notes |
|---|---|---|
| `/` Profiles | done | Hero + breadcrumb + profile rows + film children + DetailPane. URL pane state wired. |
| `/library` Library | done | Search + chips + grid/list + DetailPane + drag-resize. |
| `/player/:id` Player | done | Idle → loading → playing state machine, inactivity hide, side panel. |
| `/settings` | done | 6 sections (general, library, playback, metadata, account, danger), `?section=` deep-link. |
| `/design-system` | done | Tokens, type, spacing, all 7 logos, C-01/C-02/C-03 frames. |
| `/goodbye` | done | Atmospheric treatment + 4-second redirect. |
| `*` NotFound | done | Atmospheric treatment, navigate back / browse library. |
| ErrorBoundary | not yet ported | Prerelease has dev/prod modes — port when needed. |
| LoadingBar | not yet ported | Prerelease has a global progress bar — add if pages start needing it. |
| DevTools panel | not yet ported | Optional dev affordance. |
