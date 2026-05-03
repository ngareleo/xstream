# DetailPane

Right-rail film detail card. Opens via the parent's URL pane state (`?film=<id>`). Displays film metadata in view mode, with a toggle into edit mode for OMDb re-linking. Used on Profiles and Library pages.

**Source:** `client/src/components/detail-pane/`
**Used by:** Profiles page, Library page.

## Role

Presentational detail pane with two internal modes: **view** (metadata display) and **edit** (OMDb search picker). Owns no state — parent controls visibility and edit mode via props + callbacks.

## Props

| Prop | Type | Notes |
|---|---|---|
| `film` | `FilmShape` | The selected film object. |
| `onClose` | `() => void` | Close button callback. |
| `onEditChange` | `(editing: boolean) => void` | Edit mode toggle callback. |
| `onSave` | `(payload) => Promise<void>` | OMDb re-link save (edit mode). |
| `initialEdit` | `boolean` | Mount in edit mode if true. |

## Layout & styles

### View mode container

- `borderLeft: 1px solid var(--border)`.
- `display: flex`, `flex-direction: column`.
- `background: var(--bg-1)`, `overflow: hidden`, `height: 100%`.

### Hero block (`<Poster>` wrapper, top)

- 220px tall, `flex-shrink: 0`, `position: relative`.
- `<Poster>` fills via `width/height: 100%`, `object-fit: cover`, **`viewTransitionName: "film-backdrop"`** — shared naming contract with FilmDetailsOverlay and Player for coordinated morphing.
- Bottom-fade gradient overlay: `linear-gradient(180deg, transparent 50%, var(--bg-1))`.
- Close button: 26×26, `top: 12, right: 12`, `border: 1px solid var(--border)`, `background: rgba(0,0,0,0.6)`, `color: var(--text-dim)`, `borderRadius: 3px`, hosts `<IconClose>`. `aria-label="Close detail pane"`.

### Body block (view mode)

- `padding: 16px 22px`, `flex: 1`, `overflow-y: auto`.

#### Action row

- Play link: `<Link to={`/player/${film.id}`}>` or `/player/:id?s=X&e=Y` for series when resume point exists. Green Mono 11px underline text, white on hover. Label: `"Play"` or `"Continue"` (series).
- Expand button (series only): 26×26 icon-only, `<IconExpand>` green. Click: navigate to `/?film=${film.id}` with `document.startViewTransition` wrapper. `aria-label="Expand to fullscreen detail"`.
- Edit button: white Mono 11px underline text with green-on-hover transition. Click: `onEditChange(true)`.

#### Title

- Anton 32px, uppercase, `color: var(--text)`. Falls back to `"Unmatched file"`.

#### Metadata sections

- Eyebrow row: year · genre · duration (Mono 11px uppercase, muted).
- Chip row: resolution (green) + HDR + codec + audio.
- IMDb badge + rating (yellow) + on-disk indicator (green dot).
- Plot paragraph (conditional).
- Cast chips (conditional).

#### Seasons & Episodes (series only)

- Bordered card, `background: transparent` or subtle, `border: 1px solid var(--border-soft)`, `borderRadius: 3px`.
- Header row: `SEASONS` label (left, Mono 10px muted) + episode count (right, Mono 10px green) `"{onDisk}/{total} ON DISK"`.
- Body: `<SeasonsPanel seasons={film.seasons} defaultOpenFirst={true} onSelectEpisode={playEpisode} />`.

#### File info box

- Eyebrow `FILE`.
- Box: `background: var(--surface)`, `border: 1px solid var(--border-soft)`, `padding: 12px`, Mono 10px, muted text.
- Filename + size · bitrate · frameRate · container.

## Edit mode

Replaces entire view-mode content with an OMDb search picker when `editing === true`.

### Edit mode layout

- **Eyebrow:** `"· edit · re-link to OMDb"` (Mono 10px, dimmed, uppercase).
- **Search input:** Prefilled with `film.title ?? film.filename`, autofocused. Placeholder: `"Search OMDb by title, director, or IMDb ID…"`.
- **Results list:** `maxHeight: 55vh`, `overflow-y: auto`. Three states:
  - Empty input: placeholder text.
  - No matches: `"No matches for "{query}"."`.
  - Results: `<OmdbResultRow>` cards.

### Result card layout

- Flex row, `columnGap: 12px`.
- **Poster:** 32×48 image or fallback dot, `borderRadius: 3px`.
- **Text stack:** title+year (Mono 11px) + genre+runtime (Mono 10px muted) + imdbId+director (Mono 9px muted).
- **Checkbox mark:** right-aligned `"[ ]"` / `"[x]"` (Mono 9px).
- Hover: `backgroundColor: rgba(232, 238, 232, 0.05)`, `borderLeft: 2px solid colorBorder`.
- Selected: `backgroundColor: rgba(120, 200, 150, 0.08)`, `borderLeft: 2px solid colorGreen`, locked on select.

### Edit mode footer

- **Cancel button:** Mono 11px uppercase. Label: `[ESC] Cancel`. Calls `onCancel()` (exit without saving).
- **Link button:** Mono 11px uppercase, green text + green underline when enabled; muted + disabled when no selection. Label: `[↩] Link`. Calls `onSave()` when enabled.

### Search scoring

`searchOmdb(query, limit = 8)` scores results:
- IMDb ID prefix match: 100.
- Title prefix match: 80.
- Title contains match: 60.
- Director contains match: 40.

### Form state reset

When `film.id` changes while in edit mode, search input resets and selection clears.

## Behaviour

- `onClose` triggered by close button. Parent clears `?film` URL param.
- `onEditChange(editing: boolean)` called when entering or exiting edit mode.
- `onSave(payload)` called when Save button clicked (wired to GraphQL mutation in production).
- Body scrolls when content overflows (view mode only).
- ESC key calls `onCancel()` in edit mode (exits without saving).

## Notes

Outstanding work tracked in [`Outstanding-Work.md`](../../release/Outstanding-Work.md#detail-pane).
