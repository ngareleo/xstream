# Library (page)

> Status: **baseline** (Spec) · **not started** (Production)

## Files

- `design/Release/src/pages/Library/Library.tsx` (no `.styles.ts` — inline)
- Prerelease behavioural reference: `design/Prerelease/src/pages/Library/`

## Purpose

Searchable film grid (`/library`) with a profile filter and a grid/list view toggle. Selecting a film opens [`DetailPane`](DetailPane.md) in a drag-resizable right column.

## Visual

### Outer container
- Inline grid: closed `gridTemplateColumns: "1fr 0px 0px"`, open `1fr 4px ${paneWidth}px`. `height: 100%`. `transition: grid-template-columns 0.25s ease`.

### Left column wrapper
- Flex column, full height, `overflow: hidden`.

### Filter bar (top)
- `padding: 16px 28px`, `border-bottom: 1px solid var(--border)`, flex row gap 16.
- **Search input pill**:
  - Background: `var(--surface-2)`, `border: 1px solid var(--border)`, `border-radius: 3`, `padding: 8px 12px`.
  - `<IconSearch>` muted + `<input>` (transparent bg, no border, no outline, 12px text) + `⌘K` hint label (Mono 10 / 0.1em / `text-faint`).
  - Controlled by `search` state; updates `visible` films via `useMemo`.
- **View mode toggle** (right): two buttons (`grid` / `list`).
  - Active: `background: var(--green-soft)`, `color: var(--green)`. Inactive: transparent + `text-dim`.
  - `padding: 8px 14px`, `border: 1px solid var(--border)`, `border-radius: 2`, JetBrains Mono 10 / 0.18em / uppercase.

### Profile chips row
- `padding: 12px 28px`, `border-bottom: 1px solid var(--border-soft)`, flex gap 8.
- "All profiles" chip + one chip per profile + spacer + `SORT · RECENTLY ADDED` eyebrow.

### Body
- `flex: 1`, `overflow: auto`, `padding: 20px 28px`.
- **Grid view** (`view === "grid"`): `grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))`, gap 18, renders `<PosterCard>` per film.
- **List view**: `display: flex`, `flex-direction: column`, gap 1, renders `<ListRow>` per film.
- **Empty state** (when `visible.length === 0`): `padding: 60px 0`, centred, Mono 12 / 0.18em / uppercase / muted, copy `"No films match the current filter."`.

### Resize handle
- Visible only when `paneOpen`. `background: var(--border)`, `cursor: col-resize`.

## Behaviour

### URL params (read/write via `useSearchParams`)
- `?film=<id>` — pane open + selected film.
- `?profile=<id>` — current profile filter (chip).
- (`?q=<query>` is **not** wired — the AppHeader's search submits to `/library?q=` but Library doesn't consume it yet. TODO.)

### Filtering
- `visible = useMemo(...)`:
  - Drop films whose `profile !== profileFilter` (when filter is set).
  - When `q` is set, keep films whose `title`, `filename`, or `genre` includes `q` (case-insensitive).

### Selection
- `openFilm(id)`: toggle off if already selected (clear `?film`), else set `?film=<id>`.

### Drag-resize
- `useSplitResize` hook (same as Profiles).

## Subcomponents

### `ProfileChip`
- Props: `label`, `count`, `active`, `warn?`, `onClick`.
- `padding: 6px 12px`, `border-radius: 999px`, `font-size: 11px`.
- Active: `background: var(--green-soft)`, `border: 1px solid var(--green-deep)`, `color: var(--green)`.
- Inactive: `background: var(--surface-2)`, `border: 1px solid var(--border)`, `color: var(--text-dim)`.
- `warn` prop adds a warning indicator (TODO: confirm exact treatment from current source).

### `PosterCard` (grid view)
- 180px min, 2/3 aspect poster.
- HDR chip top-right (when present), IMDb badge bottom-right (when rated).
- "?" overlay on unmatched films.
- Selected: green border + green-glow shadow.

### `ListRow` (list view)
- Tabular row: 48px thumbnail + title + genre/profile + resolution chips + IMDb + duration + size.
- Selected: green-soft bg + green left border.

## TODO(redesign)

- Inline styles only — migrate to Griffel + a `.styles.ts`.
- `?q=<query>` URL param needs wiring into `search` state for AppHeader → Library handoff.
- "SORT · RECENTLY ADDED" eyebrow is decorative — no actual sort selector wired.
- `⌘K` hint is decorative — no global keyboard shortcut focuses the input.
- Production: search + filter + sort all need GraphQL/Relay query wiring.

## Porting checklist (`client/src/pages/Library/`)

- [ ] Outer split-body grid + drag-resize handle (mirror Profiles)
- [ ] Filter bar: search input pill + grid/list view toggle
- [ ] Search input: surface-2 bg, mono ⌘K hint, controlled by search state
- [ ] View toggle: green-soft + green when active, in JetBrains Mono uppercase
- [ ] Profile chips: rounded-pill, green-soft + green-deep border when active
- [ ] PosterCard grid: `repeat(auto-fill, minmax(180px, 1fr))`, gap 18
- [ ] PosterCard: poster + HDR chip + IMDb + selected glow
- [ ] ListRow: 48px thumbnail row with all metadata fields
- [ ] Empty state: `"No films match the current filter."` in Mono uppercase muted
- [ ] URL params: `?film=`, `?profile=`, `?q=` all wired
- [ ] Wire `⌘K` to focus the input globally
- [ ] Wire SORT control to a real selector
- [ ] Replace mock filter with backend search query

## Status

- [ ] Designed in `design/Release` lab (baseline reflects current state)
- [ ] Production implementation
