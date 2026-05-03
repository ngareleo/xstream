# Xstream — UI Design Lab (Release)

The design lab — a sandbox React+Vite prototype of the **Xstream**
streaming client. Used to validate user flows and visual treatments before
implementing against the real GraphQL/MSE data layer in `client/`.

Run with:
```bash
cd design/Release && bun install && bun dev   # http://localhost:5001
```

Or from the repo root:
```bash
bun run design                                # Release :5001
```

---

## Visual identity

The Xstream identity is a green + Anton system. Tokens are extracted from
the Figma handoff at `/home/dag/Downloads/XStream Figma Board.html` and
live in two places:

- `src/styles/tokens.ts` — typed values consumed by Griffel `makeStyles()`.
- `src/styles/shared.css` — same values exposed as CSS custom properties on
  `:root`, so Griffel can `var(--green)` and the Figma JSX-style markup
  copies cleanly without rewrites.

| Token | Value | Usage |
|---|---|---|
| `--green` | `oklch(0.78 0.20 150)` | Primary accent, badges, play buttons |
| `--green-deep` | `oklch(0.45 0.13 150)` | Hover / pressed |
| `--green-soft` | `oklch(0.78 0.20 150 / 0.12)` | Selection highlights |
| `--green-glow` | `oklch(0.78 0.20 150 / 0.35)` | Drop shadows on play head |
| `--bg-0` | `#050706` | App ink |
| `--bg-1` | `#0a0d0c` | Header / sidebar |
| `--surface` | `#14181a` | Panels |
| `--surface-2` | `#1a1f1c` | Cards, inputs |
| `--border` | `#25302a` | Dividers |
| `--text` | `#e8eee8` | Foreground |
| `--text-dim` | `#9aa6a0` | Body |
| `--text-muted` | `#6a766f` | Secondary labels |
| `--text-faint` | `#46504b` | Eyebrow / footnotes |
| `--font-head` | Anton | Display titles, hero greeting |
| `--font-body` | Inter | All UI text |
| `--font-mono` | JetBrains Mono | Eyebrow labels, file metadata |

## Pages

| Route | Status |
|---|---|
| `/` — Profiles | port-in-progress |
| `/library` — Library | port-in-progress |
| `/player/:filmId` — Player | port-in-progress |
| `/settings` — Settings | port-in-progress |
| `/design-system` — Tokens + 7 logo candidates | port-in-progress |
| `/goodbye` — Sign-out farewell | port-in-progress |
| `*` — 404 NotFound | port-in-progress |

The structural UX contracts (URL-based pane state, Player state machine,
drag-resize, inactivity hide) live in
[`docs/design/UI-Design-Spec/00-Tokens-And-Layout.md`](../../docs/design/UI-Design-Spec/00-Tokens-And-Layout.md).
Per-component specs (layout, behaviour, data) live in
[`docs/client/Components/`](../../docs/client/Components/README.md).

## Source assets

- `/home/dag/Downloads/XStream Figma Board.html` — handoff board
- `/home/dag/Downloads/app-mockups.jsx` — Profiles / Library / Player JSX
- `/home/dag/Downloads/logos.jsx` — 7 logo candidates
- `/home/dag/Downloads/xstream proto 2.zip` → `public/images/atmos-{1..4}.jpg`

The `app-mockups.jsx` file uses real OMDb poster URLs (Oppenheimer, Barbie,
Nosferatu, Civil War). Those URLs power `getPosterUrl()` in `src/data/mock.ts`.
