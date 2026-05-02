# FilmRow (component)

> Status: **baseline** (Spec) · **not started** (Production)
> Spec created: 2026-05-02 — One film row nested under a ProfileRow. Click targets split: poster → player; body → detail pane; Play/Edit text links in right cell.

## Files

- `design/Release/src/components/FilmRow/FilmRow.tsx`
- `design/Release/src/components/FilmRow/FilmRow.styles.ts`
- Shared constant: imported from `pages/Profiles/grid.ts` — `PROFILE_GRID_COLUMNS = "30px 1.3fr 0.7fr 0.6fr 80px"`

## Purpose

One film row nested inside a ProfileRow's expanded children. Uses the same 5-column grid layout. Click targets are split: poster thumbnail navigates to `/player/:id`; row body opens/toggles the detail pane; Play/Edit text links are in the right cell. Hover adds a subtle background tint + green border (locked when selected to prevent flicker).

## Visual

### Row container
- Same 5-column CSS grid: `gridTemplateColumns: PROFILE_GRID_COLUMNS` (`"30px 1.3fr 0.7fr 0.6fr 80px"`).
- `padding: 8px 24px`, `columnGap: 16px`, `cursor: pointer`.
- `backgroundColor: transparent` at rest; on `:hover`: `backgroundColor: rgba(232, 238, 232, 0.05)` (subtle tint), `borderLeftColor: var(--border)` (shows the 2px border).
- `borderLeft: 2px solid transparent` (always present, transparent at rest).
- **Selected state (`filmRowSelected`):** `background: var(--green-soft)`, `borderLeftColor: var(--green)`, `:hover` locked to `background: var(--green-soft)`, `borderLeftColor: var(--green)` (prevents flickering on hover).

### Column 1: Spacer
- Empty (aligns with ProfileRow's chevron column). 30px width.

### Column 2: Poster thumbnail + metadata
- Flex row, `columnGap: 12px`, `alignItems: flex-start`.
- **Poster thumbnail cell** (wrapped in `<button filmThumbBtn>`):
  - 26×38 button, `position: relative`, no border or bg (button styling removed).
  - `<img className={s.filmThumb}>` renders the poster with `border: 1px solid var(--border)`, `object-fit: cover`.
  - **Hover overlay** (`<span className={s.filmThumbHover}>`): `position: absolute`, `top/right/bottom/left: 0`, flexed center, displays `▶` in green, `backgroundColor: rgba(5, 7, 6, 0.55)`, `opacity: 0` at rest, `opacity: 1` on parent `:hover`.
  - Button `:hover`: `transform: scale(1.05)`, `boxShadow: 0 0 0 1px var(--green), 0 4px 12px rgba(0,0,0,0.45)`.
  - Clicking the poster **stops propagation** and navigates to `/player/:id`.
- **Metadata** (flex column, `rowGap: 4px`):
  - Title: 12px, `color: var(--text)`.
  - Year suffix: `· {year}` in `var(--text-muted)`.
  - Sub-line: `{genre.toUpperCase()} · {duration}` in Mono 10px, `var(--text-muted)`.
  - Chip group: green resolution chip + (optional) HDR chip (font-size 9, padding `2px 5px`).
  - Rating: `<ImdbBadge>` + `{rating}` in yellow (when present).
- Clicking anywhere in this column (except the poster button) calls `onSelect()` to toggle row selection.

### Column 3: (empty or reserved)
- 0.7fr width in the grid. Not visually used in this layout.

### Column 4: (empty or reserved)
- 0.6fr width in the grid. Not visually used in this layout.

### Column 5: Edit text link
- Flex row, `columnGap: 12px`, `alignItems: center`, right-aligned.
- **Edit button** (`filmEditAction`): white Mono 9px underline text, `letterSpacing: 0.16em`, uppercase, faint white underline (4px offset). Hover: white → green. Calls `onEdit(filmId)` callback (for wiring to edit-film mutation). **Stops propagation** on click.
- The Play text button has been removed. Clicking the poster thumbnail provides sufficient "play" affordance (green hover overlay with ▶ icon).

## Behaviour

### Props

- `film: FilmShape` — the film object (title, posterUrl, year, duration, genre, rating, hdr, codec, resolution).
- `selected: boolean` — whether this row is currently selected (detail pane open).
- `onOpen: (filmId: string) => void` — callback when the row body is clicked (toggle selection / open detail pane).
- `onEdit: (filmId: string) => void` — callback when the Edit text link is clicked (for wiring to edit-film or profile edit flow).

### Click behaviour split

1. **Poster button (`filmThumbBtn`):** navigates to `/player/:id}` (no row selection toggle).
2. **Row body (metadata):** calls `onOpen(film.id)` → toggles row selection / opens detail pane. **Clicking the row body does NOT navigate to the player.**
3. **Edit link:** calls `onEdit(film.id)` (for wiring to edit-film mutation or profile edit flow in production). Uses `e.stopPropagation()`.

### Selection state
- When `selected === true`, the row gets the green-soft background + green border, and `:hover` state is locked to prevent flicker.
- Unselected rows get a subtle tint on hover + transparent border (which appears only on hover).

## Changes from Prerelease

- **Extraction:** OLD — FilmRow was an inline component inside Dashboard's `<FilmDetailPane>` and Profiles. NEW — FilmRow is a standalone component.
- **Click targets:** OLD — chunky Play pill button (whole row navigates to player). NEW — split: poster → player (green hover overlay), row body → detail pane, Play/Edit links with separate behaviors.
- **Identity:** OLD — red accent (red border when selected). NEW — green accent (green border + green-soft background).
- **Affordance:** OLD — "RE-LINK" button (no-op). NEW — "Edit" link that navigates to `/profiles/:profileId/edit`.
- **Hover effect:** OLD — simple color change. NEW — subtle background tint + border reveal + scale on poster; locked selected state to prevent flicker.

## Porting checklist (`client/src/components/FilmRow/`)

- [ ] Import `PROFILE_GRID_COLUMNS` from `pages/Profiles/grid.ts`
- [ ] 5-column grid: `gridTemplateColumns: PROFILE_GRID_COLUMNS`
- [ ] Row: `padding: 8px 24px`, `columnGap: 16px`, `cursor: pointer`
- [ ] At rest: `backgroundColor: transparent`, `borderLeft: 2px solid transparent`
- [ ] On `:hover`: `backgroundColor: rgba(232, 238, 232, 0.05)`, `borderLeftColor: var(--border)` (shows border)
- [ ] Selected state: `backgroundColor: var(--green-soft)`, `borderLeftColor: var(--green)`, `:hover` locked to green state
- [ ] Column 1 (spacer): empty, 30px width
- [ ] Column 2 (poster + metadata):
  - [ ] Flex row, `columnGap: 12px`, `alignItems: flex-start`
  - [ ] Poster thumbnail button (`filmThumbBtn`): 26×38, `position: relative`, no border/bg
  - [ ] Poster image: `border: 1px solid var(--border)`, `object-fit: cover`
  - [ ] Hover overlay: absolute fill, flexed center, `▶` in green, `backgroundColor: rgba(5, 7, 6, 0.55)`, `opacity: 0` → `1` on parent `:hover`
  - [ ] Poster button `:hover`: `scale(1.05)`, `boxShadow: 0 0 0 1px var(--green), 0 4px 12px rgba(0,0,0,0.45)`
  - [ ] Poster button click: navigate to `/player/:id}`, `e.stopPropagation()`
  - [ ] Metadata (flex column):
    - [ ] Title: 12px, `color: var(--text)`
    - [ ] Year suffix: `· {year}` (muted)
    - [ ] Sub-line: `{genre.toUpperCase()} · {duration}` (Mono 10px muted)
    - [ ] Chip group: resolution (green) + HDR (if present)
    - [ ] Rating: IMDb badge + yellow number (if present)
  - [ ] Metadata click: `onOpen(film.id)` (no navigation)
- [ ] Column 3 & 4 (spacers): not visually used
- [ ] Column 5 (Edit link only):
  - [ ] Flex row, `columnGap: 12px`, `alignItems: center`, right-aligned
  - [ ] `filmEditAction`: white Mono 9px, uppercase, underline 4px offset (faint), hover green. Calls `onEdit(film.id)`, `e.stopPropagation()`
- [ ] Poster click: navigate to `/player/:id}`
- [ ] Row body (metadata) click: toggle selection / open detail pane (call `onOpen`)
- [ ] Edit link: call `onEdit(film.id)` (wire to edit-film or profile edit mutation in production)
- [ ] Wire to real Film data model (replace mock data)

## TODO(redesign)

None — the two-callback contract (`onOpen` + `onEdit`) is now locked. Edit link wiring to the production edit flow is deferred to the porting step.

## Status

- [x] Designed in `design/Release` lab — FilmRow component extracted from Profiles page inline 2026-05-02, PR #48. Click targets split: poster → player (green hover overlay), metadata → detail pane. Play text button dropped in follow-up (2026-05-02); now only Edit link remains in right cell. Callback contract finalized (`onOpen` + `onEdit`). Green selection state (locked on hover to prevent flicker). Grid layout shared with ProfileRow via `PROFILE_GRID_COLUMNS` constant.
- [ ] Production implementation

## Notes

- **Grid layout sharing:** FilmRow and ProfileRow both use `PROFILE_GRID_COLUMNS` imported from `pages/Profiles/grid.ts`. This ensures column widths lock across the tree.
- **Click target split:** The split click behavior (poster → player vs. metadata → pane) requires careful event handling. Both the poster button and the Play/Edit links use `e.stopPropagation()` to prevent triggering the metadata row's `onSelect` handler.
- **Hover lock on selected state:** When the row is selected (detail pane open), the hover state is locked to the green-soft background + green border. This prevents visual flicker when the user moves the mouse over the row while reading the detail pane.
