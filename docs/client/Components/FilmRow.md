# FilmRow

One film row nested inside a ProfileRow's expanded children. Uses the same 5-column grid layout. Click targets are split: poster thumbnail navigates to player; row body opens/toggles the detail pane; Play/Edit text links are in the right cell.

**Source:** `client/src/components/film-row/`
**Used by:** Profiles page (expanded ProfileRow children).

## Role

Presentational row component for film lists with split click targets (poster → player, metadata → detail pane, edit link → mutation). Supports optional inline series expansion via chevron. Owns no state — parent controls selection and edit wiring via props + callbacks.

## Props

| Prop | Type | Notes |
|---|---|---|
| `film` | `FilmShape` | Film object (title, posterUrl, year, duration, genre, rating, hdr, codec, resolution, kind, seasons). |
| `selected` | `boolean` | Whether this row is currently selected (detail pane open). |
| `onOpen` | `(filmId: string) => void` | Row body click — toggle selection / open detail pane. |
| `onEdit` | `(filmId: string) => void` | Edit link click — wire to edit-film mutation. |

## Layout & styles

### Row container

- 5-column CSS grid: `gridTemplateColumns: PROFILE_GRID_COLUMNS` (`"30px 1.3fr 0.7fr 0.6fr 80px"`).
- `padding: 8px 24px`, `columnGap: 16px`, `cursor: pointer`.
- At rest: `backgroundColor: transparent`, `borderLeft: 2px solid transparent`.
- On `:hover`: `backgroundColor: rgba(232, 238, 232, 0.05)`, `borderLeftColor: var(--border)`.
- **Selected state (`filmRowSelected`):** `background: var(--green-soft)`, `borderLeftColor: var(--green)`, `:hover` locked to prevent flicker.

### Column 1: Spacer

- Empty, 30px width. Aligns with ProfileRow's chevron column.

### Column 2: Poster thumbnail + metadata

- Flex row, `columnGap: 12px`, `alignItems: flex-start`.

#### Poster thumbnail button

- 26×38, `position: relative`, no border or bg styling.
- `<img>` with `border: 1px solid var(--border)`, `object-fit: cover`.
- **Hover overlay:** `position: absolute inset: 0`, flexed centre, displays `▶` in green, `backgroundColor: rgba(5, 7, 6, 0.55)`, opacity 0 → 1 on parent hover.
- Button hover: `transform: scale(1.05)`, `boxShadow: 0 0 0 1px var(--green), 0 4px 12px rgba(0,0,0,0.45)`.
- Click (stopPropagation): navigate to `/player/:id`.

#### Metadata block

- Flex column, `rowGap: 6px`.

##### Title row

- Flex row, `columnGap: 8px`, `alignItems: center`.
- **Kind glyph:** `<MediaKindBadge kind={film.kind} variant="row" />` — 12×12 inline glyph (see MediaKindBadge spec).
- **Title:** 12px, `color: var(--text)`, renders `film.title || film.filename`.
- **Chevron button (series only):** 16×16 `<IconChevron>`, right side, muted at rest, green on hover. Appears only for series. Rotates 0° (right) when collapsed, 90° (down) when expanded. Click (stopPropagation): toggle `expandedSeries` state. Does NOT call `onOpen()`.
- **Year suffix:** `· {year}` in muted text, 12px.

##### Sub-line

- **Movies:** `{genre.toUpperCase()} · {duration}` (Mono 10px muted).
- **Series:** `{genre.toUpperCase()} · {episodesOnDisk}/{totalEpisodes} EPISODES` (Mono 10px muted).

##### Chips + rating

- Chip group: green resolution chip + optional HDR chip (font-size 9, padding 2px 5px).
- Rating: `<ImdbBadge>` + `{rating}` in yellow (when present).

##### Inline series expansion

- Rendered below row when `expandedSeries === true`.
- `position: relative`, full-width, `backgroundColor: var(--bg-0)`, `borderTop/Bottom: 1px solid var(--border-soft)`.
- `paddingTop: 12px`, `paddingBottom: 12px`, `paddingLeft: 40px`, `paddingRight: 24px` (indented to align with metadata block).
- Renders `<SeasonsPanel seasons={film.seasons} defaultOpenFirst={false} />` (seasons start collapsed).
- Animates in/out with 0.2s transition.

##### Metadata click

- Clicking anywhere in the metadata block (except chevron) calls `onOpen(film.id)` to toggle row selection.

### Column 3 & 4

- Spacers, not visually used.

### Column 5: Edit link

- Flex row, `columnGap: 12px`, `alignItems: center`, right-aligned.
- **Edit button:** white Mono 9px underline text, `letterSpacing: 0.16em`, uppercase, faint white underline (4px offset).
- Hover: white → green.
- Click (stopPropagation): calls `onEdit(filmId)` (wire to edit-film mutation or profile edit flow).

## Behaviour

### Click targets

1. **Poster button:** navigate to `/player/:id` (stopPropagation).
2. **Row body (metadata):** call `onOpen(film.id)` (toggle selection, no navigation). **EXCEPTION:** chevron button stops propagation and toggles `expandedSeries` instead.
3. **Chevron button (series only):** stopPropagation, toggle inline series expansion. Does NOT affect row selection.
4. **Edit link:** call `onEdit(film.id)` (stopPropagation).

### Selection state

When `selected === true`, row gets green-soft background + green border, and hover state is locked to prevent flicker.

## Notes

Outstanding work tracked in [`Outstanding-Work.md`](../../release/Outstanding-Work.md#film-row).
