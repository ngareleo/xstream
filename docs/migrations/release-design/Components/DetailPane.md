# DetailPane

> Status: **baseline** (Spec) · **not started** (Production)
> Spec updated: 2026-05-02 — Edit mode rewritten as OMDb search picker. Search input (prefilled with film title, autofocused) + result cards with `searchOmdb(query, limit=8)` scoring (IMDb-id-prefix=100, title-prefix=80, title-contains=60, director-contains=40). Result rows show poster (32×48), title+year, genre+runtime, imdbId+director, and checkbox mark. Link button enabled only when a result is selected. Footer: `[ESC] Cancel` + `[↩] Link`. Form state resets on film-id change.

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

#### Action row (top of body) — view mode
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
  - Clicking calls `onEditChange(true)` to switch to edit mode.

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

## Edit mode

The DetailPane has two internal modes: **view** (default) and **editing** (triggered by the Edit button). When `editing === true`, the action row + title + all display sections are replaced by an OMDb search-picker form.

### View mode (default)

Rendered when `editing === false`. Shows the standard action row (Play + Edit buttons), title, metadata sections, plot, cast, and file info — exactly as described above.

### Edit mode — OMDb search picker

Triggered by clicking the Edit button (calls `onEditChange(true)`) or when the pane mounts with `initialEdit={true}`. Replaces the entire visible content with an inline re-linking flow that lets the user search OMDb and pick a match.

#### `DetailPaneEdit` sub-component (inline in edit mode)

An OMDb search picker with search input, result cards, and footer buttons:

- **Eyebrow label:** `"· edit · re-link to OMDb"` — Mono 10px, dimmed, uppercase.
- **Search input row (`editSearchRow`):** `display: flex`, `columnGap: 8px`, `alignItems: center`.
  - **Search icon (`editSearchIcon`):** `<IconSearch>` at `colorGreen`.
  - **Input (`editSearchInput`):** `type="text"`, `caretColor: transparent`, width fills available space. JetBrains Mono 11px, `color: colorText`. Prefilled with `film.title ?? film.filename` and autofocused. Placeholder: `"Search OMDb by title, director, or IMDb ID…"` in muted text. On change: resets selection and re-runs search.

- **Results list (`editResults`):** `display: flex`, `flexDirection: column`, `rowGap: 8px`, `maxHeight: 55vh`, `overflow-y: auto`. Shows one of three states:
  1. **Empty input:** Shows placeholder text `"Type to search OMDb. Pick a result to link to."` (Mono, dimmed, centred).
  2. **No matches:** Shows `"No matches for "{trimmed}"."` (Mono, dimmed, centred).
  3. **Results found:** Maps results to `<OmdbResultRow>` cards (subcomponent below).

#### `OmdbResultRow` sub-component (result card)

Each result is a clickable button-styled card:

- Layout: `display: flex`, `columnGap: 12px`, `alignItems: stretch`.
- **Poster (`editResultPoster`):** 32×48 `<Poster>` component or fallback div. Rounded corners (3px). Falls back to a centred dot `"·"` on white background if no poster URL.
- **Text stack (`editResultText`):** `display: flex`, `flexDirection: column`, `rowGap: 4px`, `flex: 1`.
  - **Title + year (`editResultTitle`):** Mono 11px, white. Contains title as main text + year as a grey-tinted span after a `·` separator (e.g., `"Oppenheimer · 2023"`).
  - **Meta (`editResultMeta`):** Mono 10px, dimmed. Renders `"{genre} · {runtime}"` (e.g., `"Biography · Drama · History · 180 min"`).
  - **IMDb ID + director (`editResultId`):** Mono 9px, dimmed. Renders `"{imdbId} · dir. {director}"`.
- **Checkbox mark (`editResultMark`):** Right-aligned, Mono 9px, `colorText`. Shows `"[ ]"` (unselected) or `"[x]"` (selected), hidden via `aria-hidden="true"`.
- **Hover state (`editResult:hover`):** `backgroundColor: rgba(232, 238, 232, 0.05)`, `borderLeft: 2px solid colorBorder`.
- **Selected state (`editResultSelected`):** `backgroundColor: rgba(120, 200, 150, 0.08)`, `borderLeft: 2px solid colorGreen`, `color: colorGreen` (locked on select, not just hover).
- On click: calls `onSelect()` to set `selected = r.imdbId`.

#### Edit mode footer (`editFooter`)

Below the results list: two text-action buttons.

- **Cancel button:** Mono 11px / uppercase / `letterSpacing: 0.16em`. `color: var(--text-muted)`, `textDecorationLine: underline`, `textDecorationColor: rgba(232, 238, 232, 0.35)`, `textUnderlineOffset: 3px`. Hover: `color: var(--text)`. Label: `[ESC] Cancel`. Clicking calls `onCancel()` (exits edit mode without saving).
- **Link button (`editSave`):** Mono 11px / uppercase / `letterSpacing: 0.16em`. **Enabled state:** `color: var(--green)`, `textDecorationLine: underline`, `textDecorationColor: var(--green)`, `textUnderlineOffset: 3px`. Hover: `color: var(--text)`. **Disabled state (`editSaveDisabled`):** `color: var(--text-muted)`, `cursor: not-allowed`, `opacity: 0.5`. Label: `[↩] Link`. Clicking (when enabled) calls `onSave()` then exits to view mode. Disabled until a result is selected.

#### Keybinds in edit mode

- **ESC:** Calls `onCancel()` (exit without saving).

#### Search scoring and result ordering

The `searchOmdb(query, limit = 8)` function (from `data/omdb.ts`) scores results based on match type, then returns up to 8 highest-scoring entries:

- **IMDb ID prefix match:** score 100 (e.g., typing `"tt1"` surfaces titles starting with that prefix at the top).
- **Title prefix match:** score 80 (e.g., typing `"Opp"` surfaces `"Oppenheimer"` before other titles).
- **Title contains match:** score 60 (e.g., typing `"knight"` surfaces `"The Dark Knight"`).
- **Director contains match:** score 40 (e.g., typing `"Nolan"` surfaces all Christopher Nolan films).
- Catalog includes the user's installed films (so re-linking an already-matched film shows the correct entry high in the results) plus canonical near-matches for variety.

#### Form state reset

When the pane's `film.id` changes while in edit mode, the search input resets to the new film's title and the selection clears. If the user was halfway through a search and the film switches, the form re-initializes.

## Behaviour

- `onClose` triggered by the close button. Parent (Profiles or Library page) clears the `?film` URL param.
- `onEditChange(editing: boolean)` called when entering or exiting edit mode.
- `onSave(payload: { title, year, imdbId, plot })` called when the Save button is clicked in edit mode (wired to a GraphQL mutation in production).
- Body scrolls when content overflows pane height (view mode only; edit mode form does not scroll).
- Props: `film: FilmShape`, `onClose: () => void`, `onEditChange?: (editing: boolean) => void`, `onSave?: (payload) => Promise<void>`, `initialEdit?: boolean`.

## Subcomponents

### **`DetailPaneEdit` (inline edit form)**

See the Edit mode section above. A sub-component rendered only when `editing === true`. Exports no props — it is instantiated by the parent DetailPane with its internal state fully managed.

## Changes from Prerelease

- **Component extraction:** OLD — the detail pane was an inline component defined inside each page file (`FilmDetailPane` in `Dashboard.tsx`, `DetailPane` in `Library.tsx`). NEW — standalone component at `design/Release/src/components/DetailPane/`. The `Prerelease behavioural reference` for this spec is both page files.
- **Poster hero:** OLD — 200px hero area with `background: film.gradient` (CSS gradient string, no real image). NEW — `<Poster>` component fills the 220px hero area with a real OMDb JPG (`film.posterUrl`), falling back to a gradient placeholder.
- **Film model:** OLD — `Film.gradient: string` drives the hero background; no `posterUrl`. NEW — `Film.posterUrl: string | null` is passed to `<Poster>`; `gradient` field removed.
- **Colour identity:** OLD — resolution badge uses `badgeRed` class (red chip). NEW — resolution chip uses `class="chip green"` (green chip). CTA link text is white-on-green instead of white-on-red.
- **Border colour:** OLD — `colorBorder: "#222222"`. NEW — `colorBorder: "#25302a"`.
- **Re-link state:** OLD — `linking` state was URL-encoded in Dashboard (`?linking=true` param, reset when switching films). In Library's inline `DetailPane`, `linking` was local state. NEW — Release `DetailPane` component uses internal `editing` state. When `editing === true`, the form is displayed. The URL-encoding behaviour from Dashboard is not reproduced; edit mode is managed via props + callbacks.
- **Edit mode (2026-05-02):** NEW — DetailPane now supports a toggle into an inline edit form with four fields (Title / Year / IMDb ID / Plot) + a footer with `[ESC] Cancel` + `[↩] Save` buttons. The form state resets when the selected film changes. This is controlled via `initialEdit` prop (mount in edit mode) and `onEditChange` callback (parent syncs URL state if desired, though in Profiles the URL is `?film=<id>&edit=1` driven; in Library the pane is not edit-enabled since it's in an overlay).
- **Body content parity:** The structural sections (action row, title, eyebrow, chip row, IMDb+on-disk row, plot, cast, file info box) are unchanged between Prerelease and Release. Exact font sizes and padding values are the same.

## TODO(redesign)

- The `● ON DISK` indicator is hard-coded green; should reflect actual file presence via the `Film` model.

## Porting checklist (`client/src/components/DetailPane/`)

### View mode
- [ ] 220px hero with Poster + bottom-fade gradient + 26×26 close button
- [ ] `border-left: 1px solid border`, `background: bg-1`, full-height column
- [ ] Action row with two `textAction`-styled links in flex row `columnGap: 18px` — Play link (`<Link>` to `/player/:id`) + Edit button
- [ ] Play link: green Mono underline text with white-on-hover transition
- [ ] Edit button: white Mono underline text with hover-to-green transition; click calls `onEditChange(true)`
- [ ] Title in Anton 32px uppercase (with `"Unmatched file"` fallback)
- [ ] Eyebrow row: year · genre · duration in Mono uppercase
- [ ] Chip row: resolution (green chip) + HDR + codec + audio chips
- [ ] IMDb badge + rating + on-disk dot
- [ ] Plot paragraph (when present)
- [ ] CAST section (when present) using `chip` utility
- [ ] FILE info box: filename + size · bitrate · frameRate · container in Mono
- [ ] Body scrolls (`overflow-y: auto`) when content exceeds pane height in view mode
- [ ] Close button calls `onClose` (parent clears `?film` URL param)

### Edit mode (OMDb search picker)
- [ ] **Render `<DetailPaneEdit>` when `editing === true`** — replaces entire view-mode content
- [ ] Eyebrow: `"· edit · re-link to OMDb"` (Mono 10px, dimmed)
- [ ] Search input row: flex, `<IconSearch>` + `<input>` prefilled with `film.title ?? film.filename`, autofocused
- [ ] Input placeholder: `"Search OMDb by title, director, or IMDb ID…"`
- [ ] On input change: reset selection, re-run `searchOmdb(query, limit=8)`
- [ ] Results list: `maxHeight: 55vh`, `overflow-y: auto`, three states:
  - [ ] Empty input: show placeholder text `"Type to search OMDb. Pick a result to link to."`
  - [ ] No matches: show `"No matches for "{trimmed}"."`
  - [ ] Results: render `<OmdbResultRow>` per result
- [ ] **`OmdbResultRow` card layout:** flex row, `columnGap: 12px`
  - [ ] Poster: 32×48 `<Poster>` or fallback div with `"·"`, `borderRadius: 3px`
  - [ ] Text stack: flex column, title+year (Mono 11px), genre+runtime (Mono 10px dimmed), imdbId+director (Mono 9px dimmed)
  - [ ] Checkbox mark: right-aligned `"[ ]"` / `"[x]"` (Mono 9px)
  - [ ] At rest: `backgroundColor: transparent`, `borderLeft: none`
  - [ ] Hover: `backgroundColor: rgba(232, 238, 232, 0.05)`, `borderLeft: 2px solid border`
  - [ ] Selected (`editResultSelected`): `backgroundColor: rgba(120, 200, 150, 0.08)`, `borderLeft: 2px solid colorGreen`, locked on select
  - [ ] Click: calls `onSelect()` to set selection
- [ ] Footer buttons:
  - [ ] Cancel: Mono 11px uppercase, muted text + faint underline; hover: white text; label `[ESC] Cancel`; calls `onCancel()`
  - [ ] Link: Mono 11px uppercase, green text + green underline when enabled; muted + disabled cursor when no selection; label `[↩] Link`; calls `onSave()` when enabled
  - [ ] Link button disabled (`editSaveDisabled`) until a result is selected
- [ ] ESC keybind: calls `onCancel()` (exit without saving)
- [ ] Form state resets when `film.id` changes (input prefilled + selection cleared)
- [ ] Wire `searchOmdb` mock to server's real `/api/omdb` fetch in production

### Props and callbacks
- [ ] Accept props: `initialEdit?: boolean` (mount in edit mode), `onEditChange?: (editing: boolean) => void` (exit mode callback), `onClose: () => void` (close pane)
- [ ] Wire to actual GraphQL `Film` model (replace mock data)

## Status

- [x] Designed in `design/Release` lab — OMDb search picker added 2026-05-02 (PR #48). View mode action row has Play + Edit buttons (distinct text-link styles: green for Play, faint white with green hover for Edit). Edit mode replaces entire content with `<DetailPaneEdit>` search picker: search input (prefilled + autofocused) + results list + footer with `[ESC] Cancel` + `[↩] Link` buttons. Results use `searchOmdb(query, limit=8)` scoring: IMDb-id-prefix=100, title-prefix=80, title-contains=60, director-contains=40. Link button enabled only when a result is selected. Form state resets when `film.id` changes. Mode toggled via `initialEdit` prop + `onEditChange` callback.
- [ ] Production implementation
