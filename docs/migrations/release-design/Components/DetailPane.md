# DetailPane

> Status: **baseline** (Spec) · **not started** (Production)

## Files

- `design/Release/src/components/DetailPane/DetailPane.tsx` (no `.styles.ts` — inline `CSSProperties`)
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
- `<Link to={\`/player/\${film.id}\`}>` Play button — fills `flex: 1`, `padding: 10px`, `background: var(--green)`, `color: var(--green-ink)`, JetBrains Mono 11px / 0.18em / uppercase / 700, `borderRadius: 2px`, `text-align: center`.
  - Label: `▶ Play in {film.resolution}`.
- Re-link button (mock — no handler) — `padding: 10px 14px`, transparent bg, `border: 1px solid var(--border)`, `color: var(--text-dim)`, same Mono treatment.

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

## TODO(redesign)

- Inline styles only — no Griffel `makeStyles`. Migrate to a `.styles.ts` for parity with AppHeader, AppShell, Sidebar, Profiles.
- "Re-link" button has no handler; production should open a search-OMDb dialog.
- The `● ON DISK` indicator is hard-coded green; should reflect actual file presence via the `Film` model.

## Porting checklist (`client/src/components/DetailPane/`)

- [ ] 220px hero with Poster + bottom-fade gradient + 26×26 close button
- [ ] `border-left: 1px solid border`, `background: bg-1`, full-height column
- [ ] Action row: Play (`<Link>` to `/player/:id`) + Re-link buttons in JetBrains Mono uppercase
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

- [ ] Designed in `design/Release` lab (baseline reflects current state)
- [ ] Production implementation
