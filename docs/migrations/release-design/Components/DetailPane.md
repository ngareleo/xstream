# DetailPane

> Status: **baseline** (Spec) · **not started** (Production)
> Spec updated: 2026-05-02 — Action row uses two distinct text-link styles: `playAction` (green text + green underline, white text + white underline on hover) and `editAction` (white text + faint white underline, green text + green underline on hover). "Play" label now reads `▶ Play` (resolved from "Play in {resolution}"). "Edit" button styled as white underline text.

## Files

- `design/Release/src/components/DetailPane/DetailPane.tsx`
- `design/Release/src/components/DetailPane/DetailPane.styles.ts`
- Prerelease behavioural reference: `design/Prerelease/src/components/DetailPane/`

## Purpose

Right-rail film detail card. Identical structure on the Profiles and Library pages; opens via the parent's URL pane state (`?film=<id>`).

## Visual

### Container
- `borderLeft: 1px solid var(--border)`.
- `display: flex; flex-direction: column`.
- `background: var(--bg-1)`, `overflow: hidden`, `height: 100%`.

### Hero block (`<Poster>` wrapper, top of pane)
- 220px tall, `flex-shrink: 0`, `position: relative`.
- `<Poster>` fills via `width/height: 100%`, `object-fit: cover`.
- Bottom-fade gradient overlay: `linear-gradient(180deg, transparent 50%, var(--bg-1))`.
- Close button (`onClose` callback): 26×26, `top: 12, right: 12`, `border: 1px solid var(--border)`, `background: rgba(0,0,0,0.6)`, `color: var(--text-dim)`, `borderRadius: 3px`, hosts `<IconClose>`. `aria-label="Close detail pane"`.

### Body block
- `padding: 16px 22px`, `flex: 1`, `overflow-y: auto`.

#### Action row (top of body)
- Two text-link elements side-by-side: `display: flex`, `alignItems: center`, `columnGap: 18px`.
- **Play link** (`playAction`) — `<Link to={\`/player/\${film.id}\`}>` with label `▶ Play`.
  - JetBrains Mono 11px, `letterSpacing: 0.18em`, uppercase, `backgroundColor: transparent`, no border, `paddingTop: 0`, `paddingBottom: 2px`, `paddingLeft: 0`, `paddingRight: 0`.
  - `color: tokens.colorGreen`, `textDecorationLine: underline`, `textDecorationColor: tokens.colorGreen`, `textDecorationThickness: 1px`, `textUnderlineOffset: 4px`.
  - Transition `color, text-decoration-color, opacity` on `0.15s`.
  - On `:hover`: `color: tokens.colorText`, `textDecorationColor: tokens.colorText` (green underline + text both flip to white).
- **Edit button** (`editAction`) — `<button>` with label `Edit`.
  - Same font as Play: Mono 11px, `letterSpacing: 0.18em`, uppercase, no border, padding `0 0 2px 0`.
  - `color: tokens.colorText` (white), `textDecorationLine: underline`, `textDecorationColor: rgba(232, 238, 232, 0.35)` (faint white), `textDecorationThickness: 1px`, `textUnderlineOffset: 4px`.
  - Transition `color, text-decoration-color, opacity` on `0.15s`.
  - On `:hover`: `color: tokens.colorGreen`, `textDecorationColor: tokens.colorGreen` (text and underline flip to green).

#### Title
- Anton 32px, `letter-spacing: -0.01em`, `text-transform: uppercase`, `color: var(--text)`.
- Falls back to `"Unmatched file"` when `film.title` is null.

#### Eyebrow row
- JetBrains Mono 11px, `letter-spacing: 0.1em`, uppercase, `color: var(--text-muted)`.
- Joins `[year, genre, duration].filter(Boolean)` with ` · `.

#### Chip row
- Flex wrap, 6px gap.
- `<span className="chip green">{film.resolution} UHD</span>`
- `<span className="chip">{hdrLabel}</span>` (only when `film.hdr` is set and not `"—"`)
- `<span className="chip">{film.codec}</span>`
- `<span className="chip">{film.audio} {film.audioChannels}</span>`
- Chip styles come from `shared.css` (`.chip`, `.chip.green`).

#### IMDb + on-disk row
- Conditional `<ImdbBadge />` + `<span style={{ color: "var(--yellow)" }}>{rating}</span>` + faint `·` separator (when `film.rating !== null`).
- Then `<span>{film.duration}</span>`, faint `·`, `<span style={{ color: "var(--green)" }}>● ON DISK</span>`.

#### Plot paragraph (conditional)
- `font-size: 12px`, `color: var(--text-dim)`, `line-height: 1.55`.

#### Cast (conditional)
- Eyebrow `CAST` (Mono 9px / 0.22em / faint).
- Chip per cast member.

#### File info box
- Eyebrow `FILE`.
- Box: `background: var(--surface)`, `border: 1px solid var(--border-soft)`, `padding: 12px`, JetBrains Mono 10px, `color: var(--text-dim)`, `line-height: 1.7`.
- Line 1: `{film.filename}`.
- Line 2 (`color: var(--text-muted)`): `{size} · {bitrate} · {frameRate} · {container}`.

## Behaviour

- Pure presentation — no internal state.
- `onClose` triggered by the close button. Parent (Profiles or Library page) clears the `?film` URL param.
- Body scrolls when content overflows pane height.

## Subcomponents

None.

## Changes from Prerelease

- **Component extraction:** OLD — the detail pane was an inline component defined inside each page file (`FilmDetailPane` in `Dashboard.tsx`, `DetailPane` in `Library.tsx`). NEW — standalone component at `design/Release/src/components/DetailPane/`. The `Prerelease behavioural reference` for this spec is both page files.
- **Poster hero:** OLD — 200px hero area with `background: film.gradient` (CSS gradient string, no real image). NEW — `<Poster>` component fills the 220px hero area with a real OMDb JPG (`film.posterUrl`), falling back to a gradient placeholder.
- **Film model:** OLD — `Film.gradient: string` drives the hero background; no `posterUrl`. NEW — `Film.posterUrl: string | null` is passed to `<Poster>`; `gradient` field removed.
- **Colour identity:** OLD — resolution badge uses `badgeRed` class (red chip). NEW — resolution chip uses `class="chip green"` (green chip). CTA link text is white-on-green instead of white-on-red.
- **Border colour:** OLD — `colorBorder: "#222222"`. NEW — `colorBorder: "#25302a"`.
- **Re-link state:** OLD — `linking` state was URL-encoded in Dashboard (`?linking=true` param, reset when switching films). In Library's inline `DetailPane`, `linking` was local state. NEW — Release `DetailPane` component uses local state (`useState`) for `linking`. The URL-encoding behaviour from Dashboard is not reproduced.
- **Body content parity:** The structural sections (action row, title, eyebrow, chip row, IMDb+on-disk row, plot, cast, file info box) are unchanged between Prerelease and Release. Exact font sizes and padding values are the same.

## TODO(redesign)

- The "Edit" button has no handler; production should open a profile edit flow or OMDb re-match dialog.
- The `● ON DISK` indicator is hard-coded green; should reflect actual file presence via the `Film` model.

## Porting checklist (`client/src/components/DetailPane/`)

- [ ] 220px hero with Poster + bottom-fade gradient + 26×26 close button
- [ ] `border-left: 1px solid border`, `background: bg-1`, full-height column
- [ ] Action row: two `textAction`-styled links in flex row `columnGap: 18px` — Play link (`<Link>` to `/player/:id`) + Edit button; green Mono underline text with white-on-hover transition
- [ ] Title in Anton 32px uppercase (with `"Unmatched file"` fallback)
- [ ] Eyebrow row: year · genre · duration in Mono uppercase
- [ ] Chip row: resolution (green chip) + HDR + codec + audio chips
- [ ] IMDb badge + rating + on-disk dot
- [ ] Plot paragraph (when present)
- [ ] CAST section (when present) using `chip` utility
- [ ] FILE info box: filename + size · bitrate · frameRate · container in Mono
- [ ] Body scrolls (`overflow-y: auto`) when content exceeds pane height
- [ ] Close button calls `onClose` (parent clears `?film` URL param)
- [ ] Wire to actual GraphQL `Film` model (replace mock data)

## Status

- [x] Designed in `design/Release` lab — action row restyled with two distinct text-link styles (Play + Edit) 2026-05-02, PR #48. `playAction` = green-underline-with-hover-to-white (primary); `editAction` = faint-white-underline-with-hover-to-green (secondary). Replaces the former glass-pill Play button + outline Re-link button design.
- [ ] Production implementation
