# Outstanding Release Work

Carried over from the (now-retired) client-redesign migration tree.
Each section below was aggregated from the per-component checklists and
groups by component name; entries link to the component's spec under
[`docs/client/Components/`](../client/Components/).

> **Verification status.** This doc was assembled by transcribing every
> unchecked checkbox from the migration tree at the moment we declared the
> migration done. Some items will already be implemented in production but
> were never re-ticked — treat this as a starting audit, not a verified
> todo list. Before scheduling work on an item, open the component spec
> and the corresponding code under `client/src/` and confirm the item is
> still pending.

## Deferred items (waiting on other work)

- **AccountMenu** — production should pass real user data from a Relay
  fragment instead of the hardcoded `USER` constant currently passed by
  AppHeader. Deferred until a viewer query lands.
- **AppHeader** — wire the scan button to the `scanLibraries` mutation
  (replaces the 2s mock timer). The Nova event surface
  (`AppHeader.ScanRequested`) is already in place and the mock timer keeps
  visual feedback for now.
- **Goodbye** — wire the goodbye flow from a sign-out mutation. Today
  `/goodbye` is reachable only by direct visit; the AccountMenu sign-out
  wiring is the trigger that needs to land.
- **Logo** — once the final mark is picked, delete `Logo01` and
  `Logo03`–`Logo07` from the `design/Release` lab. If a candidate other
  than `Logo02` wins, swap the import in
  `pages/goodbye-page/GoodbyePage.tsx`. `Logo02` is the working default
  and the only mark referenced by production.

## Cross-cutting M10 closeouts

- Mark the migration PR ready for review and out of draft (only relevant
  if reusing the existing `release-design` branch's PR).
- Final roster sync: every milestone marked `done`, final commit SHA
  recorded.
- CI green on the closeout PR.

## By component

### CreateProfile

From [`CreateProfile.md`](../client/Components/CreateProfile.md). Remaining work:

- Render the shared `<ProfileForm mode="create" ... />` component.
- Pass crumbs `["media", "profiles", "new"]`, eyebrow `"NEW PROFILE"`,
  title `"Add a library."`, subtitle text.
- Submit button label `"Create"`.
- Initial form values: empty name/path, media type MOVIES, standard movie
  extensions preset.
- On submit: navigate to `/profiles` (or wire to GraphQL create-profile
  mutation).
- Wire to the actual GraphQL `createProfile` mutation (replace mock
  navigation).

### DetailPane

From [`DetailPane.md`](../client/Components/DetailPane.md). Remaining work:

#### View mode

- 220px hero with Poster (carry `viewTransitionName: "film-backdrop"`) +
  bottom-fade gradient + 26×26 close button.
- `border-left: 1px solid border`, `background: bg-1`, full-height column.
- Action row with three elements in flex row `columnGap: 18px`:
  - Play link: `<Link>` to `/player/:id` (or `/player/:id?s=X&e=Y` for
    series when `getResumeEpisode` returns a match), green Mono underline
    text with white-on-hover transition. Label: `"Play"` (or `"Continue"`
    for series with resume point).
  - Expand button (series only): 26×26 icon-only button, `<IconExpand>`
    green, hover with glow. Click: `navigate(\`/?film=\${film.id}\`)`
    wrapped in `document.startViewTransition` (opens full-bleed overlay).
    `aria-label="Expand to fullscreen detail"`.
  - Edit button: white Mono underline text with hover-to-green
    transition; click calls `onEditChange(true)`.
- Title in Anton 32px uppercase (with `"Unmatched file"` fallback).
- Eyebrow row: year · genre · duration in Mono uppercase.
- Chip row: resolution (green chip) + HDR + codec + audio chips.
- IMDb badge + rating + on-disk dot.
- Plot paragraph (when present).
- CAST section (when present) using `chip` utility.
- **Seasons & episodes section (series only)** — rendered only when
  `film.kind === "series"` && `film.seasons` truthy:
  - Bordered card container, `borderRadius: 3px`, subtle background.
  - Header row: `SEASONS` label (left, muted Mono) + episode count
    (right, green Mono) `"{onDisk}/{total} ON DISK"`.
  - Body: render `<SeasonsPanel seasons={film.seasons} defaultOpenFirst={true} onSelectEpisode={playEpisode} />`
    (season 1 expands by default; available episodes are clickable).
  - `playEpisode(s, e)` helper: calls `navigate(\`/player/\${film.id}?s=\${s}&e=\${e}\`)`.
- File-info box: filename + size · bitrate · frameRate · container in Mono.
- Body scrolls (`overflow-y: auto`) when content exceeds pane height in
  view mode.
- Close button calls `onClose` (parent clears `?film` URL param).

#### Edit mode

- Render `<DetailPaneEdit>` when `editing === true` — replaces entire
  view-mode content.
- Eyebrow: `"· edit · re-link to OMDb"` (Mono 10px, dimmed).
- Search input row: flex, `<IconSearch>` + `<input>` prefilled with
  `film.title ?? film.filename`, autofocused.
- Input placeholder: `"Search OMDb by title, director, or IMDb ID…"`.
- On input change: reset selection, re-run `searchOmdb(query, limit=8)`.
- Results list: `maxHeight: 55vh`, `overflow-y: auto`, three states:
  - Empty input: show placeholder text `"Type to search OMDb. Pick a result to link to."`.
  - No matches: show `"No matches for \"{trimmed}\"."`.
  - Results: render `<OmdbResultRow>` per result.
- `OmdbResultRow` card layout — flex row, `columnGap: 12px`:
  - Poster: 32×48 `<Poster>` or fallback div with `"·"`,
    `borderRadius: 3px`.
  - Text stack: flex column, title+year (Mono 11px), genre+runtime
    (Mono 10px dimmed), imdbId+director (Mono 9px dimmed).
  - Checkbox mark: right-aligned `"[ ]"` / `"[x]"` (Mono 9px).
  - At rest: `backgroundColor: transparent`, `borderLeft: none`.
  - Hover: `backgroundColor: rgba(232, 238, 232, 0.05)`, `borderLeft: 2px solid border`.
  - Selected (`editResultSelected`): `backgroundColor: rgba(120, 200, 150, 0.08)`,
    `borderLeft: 2px solid colorGreen`, locked on select.
  - Click: calls `onSelect()` to set selection.
- Footer buttons:
  - Cancel: Mono 11px uppercase, muted text + faint underline; hover:
    white text; label `[ESC] Cancel`; calls `onCancel()`.
  - Link: Mono 11px uppercase, green text + green underline when
    enabled; muted + disabled cursor when no selection; label `[↩] Link`;
    calls `onSave()` when enabled.
  - Link button disabled (`editSaveDisabled`) until a result is selected.
- ESC keybind: calls `onCancel()` (exit without saving).
- Form state resets when `film.id` changes (input prefilled + selection
  cleared).
- Wire `searchOmdb` mock to server's real `/api/omdb` fetch in production.

#### Wiring

- Accept props: `initialEdit?: boolean` (mount in edit mode),
  `onEditChange?: (editing: boolean) => void` (exit mode callback),
  `onClose: () => void` (close pane).
- Wire to actual GraphQL `Film` model (replace mock data).

### DirectoryBrowser

From [`DirectoryBrowser.md`](../client/Components/DirectoryBrowser.md). Remaining work:

- Container with `backgroundColor: colorSurface`,
  `border: 1px solid colorBorder`, `maxHeight: 300px`,
  `overflowY: auto`, box shadow for depth.
- Breadcrumb trail: `/`-separated path segments, each clickable to
  navigate up; current segment bright, prior segments muted.
- Directory listing: folder icon + folder name (Mono 12px), flex column
  `rowGap: 4px`.
- Directory entry on hover:
  `backgroundColor: rgba(232, 238, 232, 0.08)`, `color: colorGreen`.
- Click directory to navigate in; update breadcrumb + re-list contents.
- Footer: current path display (left) + Cancel / Select button pair
  (right).
- "Cancel" button: white Mono text, transparent bg, hover green.
- "Select" button (CTA): green bg, green-ink text, hover brighten; calls
  `onSelect(currentPath)`.
- `initialPath` prop (defaults to `"/"`).
- `onSelect(path)` and `onCancel()` callbacks.
- Swap `mockFs.listDirectory()` for GraphQL `listDirectory(path)` query.
- Handle permission errors gracefully (show "access denied" message if
  directory is not readable).

### EdgeHandle

From [`EdgeHandle.md`](../client/Components/EdgeHandle.md). Remaining work:

- Reusable component, props: `cursorX`, `cursorY`, `onActivate`. Export
  `EDGE_DETECTION_ZONE_PX`.
- Glass disc base: 44×44 px circle (`borderRadius: 999px`, all four
  borders), `right: -22px` so half tucks behind the viewport edge,
  translucent white bg, beveled-light borders,
  `backdropFilter: blur(20px) saturate(180%)`, layered inset + ambient
  shadows.
- Single `‹` chevron glyph, monospace 16px, white, `translateX(-7px)` so
  it sits in the visible (left) half of the disc.
- Proximity math per the spec table. Smoothstep ease. Uniform scale (no
  asymmetric stretch). Cursor-Y tracking with viewport clamp.
- Self-hides via inline `opacity` + `pointerEvents` + `aria-hidden` +
  `tabIndex` on the same `eased > 0.08` threshold.
- Click handler calls `onActivate` and `e.stopPropagation()`.
- No transitions on `transform` or `top` — the handle should track the
  cursor instantly. Only `background-color, box-shadow` get a 0.18s ease
  (for the hover state).

### EditProfile

From [`EditProfile.md`](../client/Components/EditProfile.md). Remaining work:

- Read `profileId` from `useParams()`.
- Look up profile from GraphQL (or mock data); render
  `<Navigate to="/profiles" replace />` if not found.
- Render the shared `<ProfileForm mode="edit" ... />` component.
- Pass crumbs `["media", "profiles", profile.name]`, eyebrow
  `"PROFILE · {profileId}"`, title `profile.name`, subtitle `profile.path`.
- Submit button label `"Save"`.
- Initial form values: pre-fill from profile; map `profile.type` enum to
  media-type (`"tv"` → `"TV_SHOWS"`, else `"MOVIES"`); seed extensions
  from media-type presets.
- On submit: navigate to `/profiles` (or wire to GraphQL update-profile
  mutation).
- Delete affordance: show delete button below form; on click reveal
  inline confirm panel with "Are you sure?" + Delete/Cancel buttons.
- Wire to actual GraphQL `updateProfile` and `deleteProfile` mutations
  (replace mock navigation).

### FilmDetailsOverlay

From [`FilmDetailsOverlay.md`](../client/Components/FilmDetailsOverlay.md). Remaining work:

- Overlay: `position: absolute`, `inset: 0`, `overflow-y: auto`,
  `backgroundColor: colorBg0` (scrollable for suggestions below).
- Hero: `position: relative`, `width: 100%`, `height: 100vh`,
  `overflow: hidden` (fixed viewport, contains poster + content).
- Poster: `<Poster>` component fills hero,
  `viewTransitionName: "film-backdrop"` (MUST match Player).
- Ken Burns animation: `scale(1.04) translate(-0.4%, -0.3%)` →
  `scale(1.04) translate(0.4%, 0.3%)`, 26s, ease-in-out, alternate,
  infinite.
- Gradient overlay: two-gradient `backgroundImage` (vertical +
  horizontal), `position: absolute`, `inset: 0`, `pointerEvents: none`.
- Back pill: `position: absolute`, `top: 24px`, `left: 28px`, `zIndex: 4`,
  `<IconBack>` + `"Back"`, Mono 11px uppercase, glass bg
  (`rgba(0,0,0,0.45)`), hover green.
- Close button: `position: absolute`, `top: 24px`, `right: 28px`,
  `zIndex: 4`, 40×40 circular, `<IconClose>`, glass bg, hover green.
- Content stack: `position: absolute`, `left: 60px`, `right: 60px`,
  `bottom: 72px`, `zIndex: 3`, flex column `rowGap: 14px`,
  `maxWidth: 720px`.
- Chips row: resolution (green) + HDR + codec + IMDb rating (yellow).
- Title: Anton 72px uppercase, `lineHeight: 0.95`,
  `letterSpacing: -0.02em`.
- Meta row: Mono 13px uppercase, `{year} · {genre} · {duration}`, null
  filtering.
- Director: 13px, `"Directed by "` + name in white (only when
  `film.director` present).
- Plot: 15px, `lineHeight: 1.55`, `maxWidth: 640px`, `colorTextDim` (only
  when `film.plot` present).
- **Seasons rail (`.seasonsRail`, series only)** — `position: absolute`,
  `top: 84px`, `right: 60px`, `bottom: 72px`, `width: 380px`, `zIndex: 2`
  (rendered only when `film.kind === "series"` && `film.seasons` truthy):
  - Glass treatment: `backgroundColor: rgba(20,28,24,0.55)`,
    `backdropFilter: blur(20px) saturate(1.6)`, `borderRadius: 3px`,
    `border: 1px solid rgba(37,48,42,0.45)`, subtle inset highlight.
  - Header row: `display: flex`, `justifyContent: space-between`,
    "SEASONS" label (left, muted Mono 10px) + episode count (right, green
    Mono 10px) `"{onDisk}/{total} ON DISK"`.
  - Body: `flex: 1`, `overflow-y: auto`, render
    `<SeasonsPanel seasons={film.seasons} defaultOpenFirst={true} onSelectEpisode={playEpisode} />`.
  - `playEpisode(s, e)` helper: calls
    `navigate(\`/player/\${film.id}?s=\${s}&e=\${e}\`)`.
  - Content max-width adjustment: when rail is present, reduce overlay
    content max-width from 720px → 560px (`contentWithRail` class) to
    prevent title collision.
- Play CTA glass pill (at rest):
  `backgroundColor: rgba(255,255,255,0.12)`, `borderRadius: 999px`,
  `backdropFilter: blur(20px) saturate(180%)`, beveled-light borders,
  Mono 12px uppercase.
- Play CTA transition:
  `transitionProperty: transform, box-shadow, background-color, color, border-color, text-shadow`,
  `0.18s`, `ease-out`.
- Play CTA **hover — dimmed "lighted sign" effect:**
  - `transform: translateY(-1px)`.
  - `backgroundColor: oklch(0.78 0.20 150 / 0.18)` (green-tinted glass).
  - Borders: alpha-gradient from top bright (0.55) → left/right (0.4) →
    bottom dim (0.25) in green (`oklch(0.78 0.20 150 / α)`).
  - `color: tokens.colorGreen`.
  - `textShadow: 0 0 4px (colorGreenGlow / 0.35), 0 0 18px colorGreen`
    (dimmed two-layer: tight inner focus, soft ambient — NOT the bright
    variant).
  - `boxShadow: inset green top highlight + shadow + 14px ambient glow (colorGreenGlow / 0.18)`
    (narrower halo; NOT the earlier 32px + 80px dual halos).
- Play CTA icon (at rest): engraved —
  `color: rgba(255,255,255,0.55)`,
  `filter: drop-shadow(0 1px ...) drop-shadow(0 -1px ...)` (white
  recessed shadows).
- Play CTA icon **hover:** `color: tokens.colorGreen`,
  `filter: drop-shadow(0 0 4px colorGreen) drop-shadow(0 0 12px colorGreenGlow)`
  (green glowing).
- Play CTA active: `transform: translateY(0) scale(0.98)`.
- Scroll hint (`.scrollHint`): Mono 10px uppercase, positioned
  `bottom: -44px`, renders `"▾ scroll for suggestions"` (only when
  suggestions present), pulsing animation (1.8s, 0.4 → 0.85 opacity,
  `translateY(0→3px)`), `aria-hidden="true"`.
- Play button: `<button onClick={playWithTransition}>`, wraps
  `document.startViewTransition(() => navigate("/player/{id}"))` with
  plain navigate fallback.
- Filename: Mono 10px, `colorTextFaint`, `film.filename`.
- Back pill and Close button call `onClose()` (parent clears `?film`
  param).
- Suggestions section (`.suggestions`): rendered only when
  `suggestions.length > 0`, **after** the hero section (not inside it).
- Padding: `paddingTop: 40px`, `paddingBottom: 60px`,
  `backgroundColor: colorBg0` (matches overlay bg).
- `<PosterRow title="You might also like">` container.
- Map suggestions to `<FilmTile>` components.
- FilmTile click handler: calls `onSelectSuggestion(id)` if provided
  (and scrolls overlay to top via
  `overlayRef.current?.scrollTo({ top: 0, behavior: "smooth" })`), else
  navigates to `/player/{id}`.
- Accept props: `film: FilmShape`, `suggestions?: Film[]` (default: []),
  `onClose: () => void`, `onSelectSuggestion?: (id: string) => void`.
- Wire to real Film data (replace mock data).
- Verify `viewTransitionName: "film-backdrop"` matches Player's backdrop
  view-transition name.

### FilmRow

From [`FilmRow.md`](../client/Components/FilmRow.md). Remaining work:

- Import `PROFILE_GRID_COLUMNS` from `pages/Profiles/grid.ts`.
- 5-column grid: `gridTemplateColumns: PROFILE_GRID_COLUMNS`.
- Row: `padding: 8px 24px`, `columnGap: 16px`, `cursor: pointer`.
- At rest: `backgroundColor: transparent`,
  `borderLeft: 2px solid transparent`.
- On `:hover`: `backgroundColor: rgba(232, 238, 232, 0.05)`,
  `borderLeftColor: var(--border)`.
- Selected state: `backgroundColor: var(--green-soft)`,
  `borderLeftColor: var(--green)`, `:hover` locked to green state.
- Column 1 (spacer): empty, 30px width.
- Column 2 (poster + metadata):
  - Flex row, `columnGap: 12px`, `alignItems: flex-start`.
  - Poster thumbnail button (`filmThumbBtn`): 26×38, `position: relative`,
    no border/bg.
  - Poster image: `border: 1px solid var(--border)`,
    `object-fit: cover`.
  - Hover overlay: absolute fill, flexed center, `▶` in green,
    `backgroundColor: rgba(5, 7, 6, 0.55)`, `opacity: 0` → `1` on parent
    `:hover`.
  - Poster button `:hover`: `scale(1.05)`,
    `boxShadow: 0 0 0 1px var(--green), 0 4px 12px rgba(0,0,0,0.45)`.
  - Poster button click: navigate to `/player/:id`,
    `e.stopPropagation()`.
  - Metadata (flex column, `rowGap: 6px`):
    - **Title row (`filmTitleRow`)** — flex row, `columnGap: 8px`,
      `alignItems: center`.
    - **Film kind glyph** — render
      `<MediaKindBadge kind={film.kind} variant="row" />` — 12×12 inline
      glyph, series green, movie muted.
    - **Title** — 12px, `color: var(--text)`,
      `film.title || film.filename`.
    - **Chevron button (series only)** — 16×16 `<IconChevron>`, muted at
      rest, green on hover; right side of title row; rotate 0°/90° based
      on `expandedSeries` state; click `stopPropagation()` and toggle
      `expandedSeries`.
    - Year suffix: `· {year}` (muted), 12px.
    - Sub-line — for movies:
      `{genre.toUpperCase()} · {duration}` (Mono 10px muted). For series:
      `{genre.toUpperCase()} · {episodesOnDisk}/{totalEpisodes} EPISODES`
      (Mono 10px muted).
    - Chip group: resolution (green) + HDR (if present).
    - Rating: IMDb badge + yellow number (if present).
  - **Inline series expansion (`.seriesExpansionHost`)** — rendered
    below row when `expandedSeries === true`,
    `backgroundColor: var(--bg-0)`, borders top/bottom, indented 40px
    left + 24px right; contains
    `<SeasonsPanel seasons={film.seasons} defaultOpenFirst={false} />`.
  - Metadata click (except chevron): `onOpen(film.id)` (no navigation).
- Column 3 & 4 (spacers): not visually used.
- Column 5 (Edit link only):
  - Flex row, `columnGap: 12px`, `alignItems: center`, right-aligned.
  - `filmEditAction`: white Mono 9px, uppercase, underline 4px offset
    (faint), hover green. Calls `onEdit(film.id)`, `e.stopPropagation()`.
- Poster click: navigate to `/player/:id`.
- Row body (metadata) click: toggle selection / open detail pane (call
  `onOpen`).
- Chevron click (series only): toggle `expandedSeries` state,
  showing/hiding `<SeasonsPanel>`.
- Edit link: call `onEdit(film.id)` (wire to edit-film or profile edit
  mutation in production).
- Wire to real Film data model (replace mock data) including `kind`,
  `seasons` for series.

### FilmTile

From [`FilmTile.md`](../client/Components/FilmTile.md). Remaining work:

- `TILE_WIDTH = 200`, `TILE_GAP = 16`, `TILE_STRIDE = 216` exported as
  module constants.
- Button element: `type="button"`, `width: 200px`, `flexShrink: 0`,
  `textAlign: left`, `color: inherit`, transparent bg, no border.
- Kind badge: render `<MediaKindBadge kind={film.kind} variant="tile" />`.
- Frame: `position: relative`, `aspectRatio: 2/3`, 1px solid
  `colorBorder`, `backgroundColor: colorSurface`, transition
  box-shadow + transform (0.25s).
- Frame::after border wipe: green border all sides,
  `clipPath: inset(100% 0 0 0)` → `inset(0 0 0 0)` on hover, ease-out
  transition.
- Hover on frame: `translateY(-3px)` +
  `boxShadow: 0 8px 20px colorGreenGlow, 0 2px 6px colorGreenSoft`.
- Image: `width/height: 100%`, `objectFit: cover`, `display: block`.
- Progress bar (optional): absolute bottom, 3px tall, dark background,
  green fill to `{progress}%`.
- Metadata: `marginTop: 10px`.
- Title: 13px, `colorText`, `film.title || film.filename`.
- Subtitle: Mono 10px, `colorTextMuted`, `letterSpacing: 0.06em`,
  `marginTop: 3px`, `"{year} · {duration}"` with null filtering.
- Click handler: calls `onClick()` (parent sets up navigation).
- `scrollSnapAlign: start` (carousel alignment constraint).
- Wire to real `Film` data model (replace mock data) including `kind`
  discriminator.

### FilterSlide

From [`FilterSlide.md`](../client/Components/FilterSlide.md). Remaining work:

- Container: same as SearchSlide (flexGrow, flex column, Mono).
- Eyebrow: Mono 11px uppercase, green, pattern: `"· filters" + optional
  query + count arrow` (arrow always shown:
  `totalMatched → resultCount`).
- TUI table: `display: flex`, `flexDirection: column`, `rowGap: 10px`,
  Mono 13px, semi-transparent dark bg, left border.
- Four filter rows (or more if more dimensions added): resolution / HDR /
  codec / decade.
- Each row: `gridTemplateColumns: 120px 1fr`, dimension label (left),
  toggle buttons (right).
- Toggle button: `[ ]` or `[x]` box + label, Mono 13px,
  `color: colorTextDim` at rest, `colorGreen` when checked.
- Hover on toggle: `color: colorText` (when not checked), stay
  `colorGreen` (when checked).
- Clicking toggle calls `setFilters` with `toggleSetItem` helper.
- Clear button disabled when no filters are active (`opacity: 0.35`,
  `cursor: not-allowed`).
- Actions row: `marginTop: auto`, flex, `columnGap: 20px`,
  `paddingTop: 16px`.
- Primary action: `"[↩] Done"` green underlined text (Mono 13px), hover
  white; calls `onClose()`.
- Secondary action: `"[⇧⌫] Clear"` grey underlined text (Mono 12px),
  hover white (enabled), disabled style when no filters; calls
  `onClearFilters()`.
- Hint: `marginLeft: auto`, Mono 10px faint text (profile + match count
  display).
- Import and use `toggleSetItem`, `filtersActive`, `EMPTY_FILTERS` from
  `filters.ts`.
- Wire `onClose` and `onClearFilters` callbacks to parent Library state
  machine.
- Ensure filter application order: filters always narrow query results,
  never broaden them.

### Library

From [`Library.md`](../client/Components/Library.md). Remaining work
(this is the largest spec; split by section):

#### Hero

- Hero `height: 75vh`, `position: relative`, `overflow: hidden`,
  `flexShrink: 0`, **`borderRadius: 6px`** (inset from page edges by
  40px, NOT full-bleed).
- `heroSlides`: `position: absolute`, `inset: 0`; all four canonical
  posters rendered simultaneously.
- Each `heroImg`: `position: absolute`, `inset: 0`, `width/height: 100%`,
  `objectFit: cover`, `filter: grayscale(1) brightness(0.55)`,
  `opacity: 0`, `transitionProperty: opacity`, `transitionDuration: 0.9s`,
  `transitionTimingFunction: ease`.
- Ken Burns on every `heroImg`: 0% `scale(1.06) translate(-0.8%, -0.6%)`
  → 100% `scale(1.06) translate(0.8%, 0.6%)`, 20s ease-in-out alternate
  infinite.
- `heroImgActive`: `opacity: 1`. `heroImgFading` (active + fading flag):
  `opacity: 0`.
- `heroEdgeFade`: two-gradient (`to bottom` + `to right`),
  `backgroundSize: 100% 115%, 115% 100%`, 22s `backgroundPosition`
  animation cycling `0% 0%, 0% 0%` → `0% 100%, 100% 0%` → back.
- `heroBottomFade`:
  `linear-gradient(180deg, transparent 50%, rgba(5,7,6,0.8) 88%, colorBg0 100%)`
  + `linear-gradient(90deg, colorBg0 0%, rgba(5,7,6,0.85) 22%, transparent 55%)`.
- Grain layer: `<div className="grain-layer" />`.
- Search bar: inside hero block, between `grain-layer` and `heroBody`
  (see Search bar section below).
- `heroBody`: `position: absolute`, `inset: 0`,
  `paddingTop: calc(headerHeight + 32px)` (84px),
  `paddingBottom: 20px`, **`paddingLeft: 44px`**,
  **`paddingRight: 44px`**, flex column `rowGap: 20px` (no
  space-between), `zIndex: 2`.
- `greetingEyebrow`: `fontMono`, 12px, `letterSpacing: 0.18em`,
  uppercase, `colorGreen`. Text:
  `"· {greeting()}, {user.name.toUpperCase()}"` where `greeting()`
  returns time-of-day string.
- `.greeting` div: Anton 64px, `lineHeight: 0.92`,
  `letterSpacing: -0.02em`, `marginTop: 28px`,
  `display: inline-block`, `transformOrigin: center center`,
  `transformStyle: preserve-3d`, `willChange: transform`,
  `transitionProperty: transform`, `transitionDuration: 0.18s`,
  `transitionTimingFunction: ease-out`.
- 3D tilt: `onMouseMove` computes `nx = (clientX - left)/width - 0.5`,
  `ny = (clientY - top)/height - 0.5`; sets
  `transform: perspective(800px) rotateX(${ny*18}deg) rotateY(${-nx*18}deg)`.
  `onMouseLeave` resets to 0,0.
- Slide dots: 4 `<button type="button">`, `display: flex`,
  `columnGap: 8px`. Active: `width: 26px`, `height: 3px`,
  `borderRadius: 2px`, `backgroundColor: colorGreen`. Inactive:
  `width: 8px`, same. Transition: `width, background-color`,
  `transitionDuration: transitionSlow`.
  `aria-label={Show ${film.title}}`.
- Interval: 7000ms; inner timeout: 700ms; both cleaned up via refs on
  unmount. Effect dependency: `[heroFilms.length, selectedFilm]`.
- `goToHero(idx)`: no-op if same index; else fade out (`setHeroFading
  true`), 350ms later set index + fade in.

#### Hero modes

- State: `[heroMode, heroMode]` derived from `filterOpen`,
  `searchFocused`, `searching`.
  `heroMode = filterOpen ? "filtering" : (searchFocused || searching ? "searching" : "idle")`.
- `.heroActive` class applied when `heroMode !== "idle"` — visual changes:
  - `borderRadius: 0` (hero loses rounded corners; becomes flush with
    page edges).
  - `backgroundColor: colorBg0` (dark hero reads as continuous with page
    background, no visible border).
- `heroPanelBg` (dark backdrop + dot-grid + radial glow) rendered when
  `heroMode !== "idle"`, positioned
  `absolute inset: 0 pointerEvents: none`:
  - `backgroundImage: radial-gradient(ellipse 92% 88% at 50% 48%, #000 55%, transparent 100%)`
    — soft radial mask that fades the dot grid + green glow into
    transparency at the edges.
  - Rationale: dissolve the hero's visual edge into the page background
    when in search or filter mode.
- Hero body conditionally renders:
  - **idle mode:** greeting eyebrow + 3D-tilted greeting text + slide
    dots (existing behavior).
  - **searching mode:** `<SearchSlide ... />` component.
  - **filtering mode:** `<FilterSlide ... />` component.
- `searchBarFocused` class applied when
  `searchFocused || heroMode !== "idle"` (bumps gradient alpha from 0.42
  to 0.7).

#### Search slide content

- `slidePanel`: flex column, `rowGap: 20px`, `fontFamily: fontMono`,
  `paddingTop: 12px`, `flexGrow: 1` (push actions down).
- Eyebrow: Mono 11px / `letterSpacing: 0.22em` / uppercase / green.
  Text: `"· search"` (no query) or `"· query · {resultCount} result(s)"`
  (with query) + if filters active: `" · "` + `<span slideEyebrowAccent>`
  (white) `"{activeFilterCount} filter(s)"`.
- Prompt row: flex `alignItems: baseline columnGap: 16px`, Mono **56px**
  / `lineHeight: 1`:
  - Caret (`slidePromptCaret`): green `">"`, Mono weight.
  - Text (`slidePromptText`): white,
    `display: inline-flex alignItems: center columnGap: 4px minHeight: 1em overflowX: hidden whiteSpace: nowrap`.
    Renders trimmed query if present.
  - Cursor (`slidePromptCursor`): green block (`width: 12px height: 0.85em`),
    glowing shadow, pulsing animation 1.05s ease-in-out. Always visible
    in searching mode.
- Status row: Mono 12px / `letterSpacing: 0.06em` / `colorTextDim`, flex
  wrap `columnGap: 10px rowGap: 6px`:
  - With query: `"{resultCount} of {totalMatched} match(es) · {profilesMatched} profile(s)"`
    + if filtered: `" · "` + `<span slideStatusAccent>` (green) `"filtered ({activeFilterCount})"`.
  - No query: `<span slideStatusHint>` (italic `colorTextMuted`)
    `"type to search films, directors, genres"`.
  - Separators: `<span slideStatusSep>` (dim) `"·"`.
- Actions row: `marginTop: auto`, flex
  `alignItems: center columnGap: 20px paddingTop: 16px flexWrap: wrap`:
  - Primary button (`slidePrimary`): `"[F] Filter"`, green underlined
    text, Mono 13px / `letterSpacing: 0.18em` / uppercase,
    `textDecorationColor: colorGreen textUnderlineOffset: 5px textDecorationThickness: 1px`.
    Hover: white. `onClick={onOpenFilter}`.
  - Secondary button (`slideSecondary`): `"[ESC] Clear"`, grey
    underlined text, Mono 12px / `letterSpacing: 0.18em` / uppercase.
    Hover: white. `onClick={onClear}`.

#### Filter slide content

- `slidePanel`: flex column, `rowGap: 20px`, `fontFamily: fontMono`,
  `paddingTop: 12px`, `flexGrow: 1`.
- Eyebrow: Mono 11px / `letterSpacing: 0.22em` / uppercase / green.
  Text: `"· filters"` + if query: `" · {query.trim()}"` + if query and
  results differ: `" · "` + `<span slideEyebrowAccent>` (white)
  `"{totalMatched} → {resultCount}"`.
- TUI table (`tuiTable`): flex column, `rowGap: 10px`, Mono 13px,
  `paddingTop/Bottom: 8px paddingLeft/Right: 16px`, left border 1px
  `colorBorder`, bg `rgba(20, 24, 22, 0.55)`:
  - Each dimension (resolution, HDR, codec, decade) rendered as
    `<FilterRow label="..." >` containing 3–4 `<TuiToggle>` buttons.
  - `tuiRow`: CSS grid
    `gridTemplateColumns: 120px 1fr columnGap: 16px alignItems: center`:
    - `tuiRowLabel`: Mono 11px / `letterSpacing: 0.22em` / uppercase /
      `colorTextFaint`. Dimension name.
    - `tuiRowOptions`: flex
      `flexWrap: wrap columnGap: 16px rowGap: 6px`, houses toggle
      buttons.
  - `tuiToggle` button: Mono 13px / `letterSpacing: 0.04em`,
    `aria-pressed={checked}`. `color: colorTextDim` at rest, `colorText`
    on hover. When checked: `color: colorGreen`. Inline-flex
    `alignItems: center columnGap: 8px`:
    - `tuiToggleBox`: Mono, color inherited. Renders `"[x]"` (checked)
      or `"[ ]"` (unchecked).
    - Label: filter option (e.g., `"4K"`, `"HDR10"`, `"HEVC"`,
      `"'90s"`). Special case: HDR `"—"` → label `"SDR"`.
  - Filter constants:
    - `RESOLUTIONS = ["4K", "1080p", "720p"]`.
    - `HDRS = ["DV", "HDR10", "HDR10+", "—"]`.
    - `CODECS = ["HEVC", "H264", "AV1"]`.
    - `DECADES = [{decade: 1990, label: "'90s"}, {decade: 2000, label: "'00s"}, {decade: 2010, label: "'10s"}, {decade: 2020, label: "'20s"}]`.
- Actions row: `marginTop: auto`, flex
  `alignItems: center columnGap: 20px paddingTop: 16px flexWrap: wrap`:
  - Primary button (`slidePrimary`): `"[↩] Done"`, green underlined
    text (same style as SearchSlide). `onClick={onClose}`.
  - Secondary button (`slideSecondary`): `"[⇧⌫] Clear"`, grey underlined
    text. `disabled={activeFilterCount === 0}`. When disabled:
    `opacity: 0.35 cursor: not-allowed`. `onClick={onClearFilters}`
    (resets all filters to empty Sets).
  - Hint (`slideHint`): `marginLeft: auto`, Mono 10px /
    `letterSpacing: 0.12em` / `colorTextFaint` / uppercase. Text:
    `"{profiles.length} libraries · {totalMatched} matches before filters"`.

#### Filter state

- `Filters` type:
  `{ resolutions: Set<Resolution>, hdrs: Set<Hdr>, codecs: Set<Codec>, decades: Set<number> }`.
- `activeFilterCount = resolutions.size + hdrs.size + codecs.size + decades.size`.
- `searchResults = applyFilters(queryMatched, filters)` — filters apply
  on top of query matches, never broaden.
- `applyFilters` excludes films that don't match all active filter
  dimensions.
- `toggleSetItem<T>(set: Set<T>, item: T)` helper: add if not present,
  remove if present.
- `clearAll()` helper: resets `search`, `filters`, `filterOpen`,
  `searchFocused` simultaneously.
- ESC keybind:
  - When `heroMode !== "idle"`: attach window keydown listener.
  - If `filterOpen === true`: `setFilterOpen(false)`.
  - Else: `clearAll()`.

#### Search bar

- `searchBar`: `position: absolute`,
  `top: calc(headerHeight + 24px)`, `right: 32px`, `zIndex: 3`,
  `width: 320px`, `display: flex`, `alignItems: center`,
  `columnGap: 10px`, `paddingTop/Bottom: 8px`, `paddingLeft: 16px`,
  `paddingRight: 12px`.
- `searchBar` background:
  `linear-gradient(90deg, rgba(20,28,24,0) 0%, rgba(20,28,24,0.42) 22%, rgba(20,28,24,0.42) 78%, rgba(20,28,24,0) 100%)`,
  `transitionProperty: background-image`,
  `transitionDuration: tokens.transition`.
- `searchBarFocused` bumps alpha to 0.7 at 22% and 78% stops (applied
  via JS `searchFocused` state).
- `searchIcon`: `<IconSearch>`, `color: colorGreen`, `flexShrink: 0`.
- `searchInputWrap`: `position: relative`, `flexGrow: 1`,
  `display: flex`, `alignItems: center`, `minWidth: 0`,
  `height: 20px`.
- `searchInput`: `caretColor: transparent`, `width: 100%`, transparent
  bg, no border, no outline, Mono 12px, `letterSpacing: 0.06em`,
  `paddingRight: 12px`, `paddingTop/Bottom/Left: 0`. Placeholder:
  `colorTextMuted`, `letterSpacing: 0.14em`, uppercase, 10px.
  `spellCheck={false}`, `autoComplete="off"`,
  `aria-label="Search the library"`. Placeholder cleared on focus
  (conditional prop on `placeholder`).
- `searchMirror`: `position: absolute`, `left: 0`, `top: 50%`,
  `transform: translateY(-50%)`, `visibility: hidden`,
  `pointerEvents: none`, `whiteSpace: pre`, Mono 12px,
  `letterSpacing: 0.06em`. `useEffect([search, searchFocused])` reads
  `mirrorRef.current.offsetWidth` → `setSearchCaretX`.
- `searchCaret`: rendered when `searchFocused`. `position: absolute`,
  `top: 50%`, `marginTop: -7px`, `width: 7px`, `height: 14px`,
  `borderRadius: 1px` all corners, `backgroundColor: colorGreen`,
  `boxShadow: 0 0 6px colorGreen, 0 0 14px colorGreenGlow`. Pulsing
  keyframe: 0%/100% `opacity:1 scaleY(1)`, 50%
  `opacity:0.25 scaleY(0.86)`, 1.05s ease-in-out infinite. Positioned
  via `style={{ left: searchCaretX + "px" }}`.
- `searchClear`: 20×20 button, `<IconClose 12×12>`,
  `aria-label="Clear search"`, shown when
  `searching || activeFilterCount > 0`. Click: `clearAll()` (resets
  query + filters + focus).
- `onBlur` clears `searchFocused` after 120ms `window.setTimeout` (so
  clicks on the clear button register first).

#### Search state

- State variables: `[search, setSearch]`,
  `[searchFocused, setSearchFocused]`, `[filterOpen, setFilterOpen]`,
  `[filters, setFilters]`.
- Derived values: `trimmedQuery = search.trim().toLowerCase()`,
  `searching = trimmedQuery.length > 0`,
  `heroMode = filterOpen ? "filtering" : (searchFocused || searching ? "searching" : "idle")`,
  `activeFilterCount = filtersActive(filters)`.
- `queryMatched`: all films whose title/filename/director/genre
  (case-insensitive) includes `trimmedQuery`. Recomputed by
  `useMemo([trimmedQuery])`.
- `searchResults = applyFilters(queryMatched, filters)`. Recomputed by
  `useMemo([queryMatched, filters])`.
- When `heroMode === "idle"` and `trimmedQuery.length === 0` → rows
  section renders three default row components.
- When `heroMode === "searching"` with results found → `searchResults`
  flex column `rowGap: 16px` containing `rowHeader`
  (`"Results · {N}"`) + `searchGrid` (`display: grid gridTemplateColumns: repeat(auto-fill, 200px) justifyContent: start columnGap: 16px rowGap: 24px`)
  with `<FilmTile>` per result.
- When `heroMode === "searching"` with no results → `<div noResults>`
  (Mono 12px / `letterSpacing: 0.18em` / uppercase / `colorTextMuted` /
  `textAlign: center` / `paddingTop/Bottom: 40px`) with text
  `"No films match \"{search.trim()}\""`.
- Query filter logic: title / filename / director / genre (all
  `.toLowerCase()`) includes `trimmedQuery`.
- Production: replace client-side query/filter with backend search
  query / Relay refetch. Wire `?q=<query>` URL param for shareability.

#### Rows

- `rowsScroll`: `flexGrow: 1`, `paddingTop: 20px`, `paddingBottom: 60px`,
  `display: flex`, `flexDirection: column`, `rowGap: 28px`. **No
  `paddingLeft` or `paddingRight`** (page provides 40px inset).
- Three rows in order: "Continue watching" (watchlist items with
  progress), "New releases" (from `newReleaseIds`), "Watchlist"
  (watchlist items without progress). Each row skipped if empty.
- `row`: flex column, `rowGap: 12px`.
- `rowHeader`: Mono 11px, `letterSpacing: 0.22em`, uppercase,
  `colorTextDim`.
- `rowFrame`: `position: relative` (hosts the track + arrow buttons).
- `rowTrack`: `display: flex`, `columnGap: 16px`, `overflowX: auto`,
  `overflowY: hidden`, scrollbar hidden, `scrollSnapType: x proximity`,
  `paddingBottom: 8px`.
- `rowArrow` (base): 44×44 circle, `position: absolute`,
  `top: calc(50% - 24px)`, glass bg `rgba(8,11,10,0.65)`
  `backdropFilter: blur(10px) saturate(1.4)`, 1px solid `colorBorder`,
  `borderRadius: 50%`, `zIndex: 4`. Hover: `rgba(8,11,10,0.85)`, border
  → `colorGreen`, `color: colorGreen`, `scale(1.06)`.
- `rowArrowLeft`: `left: -12px`. `rowArrowRight`: `right: -12px`.
- `hasPrev`: `scrollLeft > 4`.
  `hasNext`: `scrollLeft + clientWidth < scrollWidth - 4`. Updated by
  scroll listener + `ResizeObserver`.
- RAF smooth scroll: `easeInOutCubic` easing,
  `ROW_SCROLL_DURATION_MS = 720`.
- Page size: `Math.max(1, Math.floor(clientWidth / TILE_STRIDE)) * TILE_STRIDE`
  (must be a multiple of 216px — invariant).

#### FilmTile (within rows)

- `TILE_WIDTH = 200`, `TILE_GAP = 16`, `TILE_STRIDE = 216`.
- `<button type="button">`, `width: 200px`, `flexShrink: 0`,
  `textAlign: left`, `scrollSnapAlign: start`.
- `tileFrame`: `position: relative`, `aspectRatio: 2/3`, 1px solid
  `colorBorder` all sides, `backgroundColor: colorSurface`,
  `transitionProperty: box-shadow, transform`,
  `transitionDuration: transitionSlow (0.25s)`.
- `tileFrame::after`: `position: absolute`,
  `top/right/bottom/left: -1px`, 1px solid `colorGreen` all sides,
  `clipPath: inset(100% 0 0 0)` at rest, `inset(0 0 0 0)` on hover.
  `transitionProperty: clip-path`,
  `transitionDuration: transitionSlow`,
  `transitionTimingFunction: ease-out`. `pointerEvents: none`.
- `tileFrame:hover`: `transform: translateY(-3px)`,
  `boxShadow: 0 8px 20px colorGreenGlow, 0 2px 6px colorGreenSoft`.
- `tileFrame:hover::after`: `clipPath: inset(0 0 0 0)`.
- `tileImage`: `width: 100%`, `height: 100%`, `objectFit: cover`,
  `display: block`.
- Progress bar: `progressTrack` 3px absolute bottom,
  `rgba(0,0,0,0.55)` track; `progressFill` `colorGreen`,
  `width: {progress}%`. Only rendered when `progress !== undefined`.
- `tileMeta`: `marginTop: 10px`; `tileTitle`: 13px, `colorText`;
  `tileSubtitle`: Mono 10px, `colorTextMuted`,
  `letterSpacing: 0.06em`, `marginTop: 3px`. Subtitle text:
  `{year} · {duration}` via `filter(Boolean).join(" · ")`.
- Tile click: `openFilm(film.id)` → `setSearchParams({ film: id })`.

#### Film overlay (full-bleed)

- Replaces entire Library page output (not rendered inside page
  container).
- `.overlay`: `position: absolute`, `inset: 0`, `overflow-y: auto`,
  `backgroundColor: colorBg0` (scrollable for suggestions carousel
  below).
- `.hero`: `position: relative`, `width: 100%`, `height: 100vh`,
  `overflow: hidden` (fixed viewport container).
- `.overlayPoster`: `position: absolute`, `inset: 0`,
  `width/height: 100%`, `objectFit: cover`,
  **`viewTransitionName: "film-backdrop"`** (MUST match Player
  `.backdrop`). Ken Burns:
  `scale(1.04) translate(-0.4%, -0.3%)` →
  `scale(1.04) translate(0.4%, 0.3%)`, 26s, ease-in-out, alternate,
  infinite. Full-color (no filter).
- `.overlayGradient`: `position: absolute`, `inset: 0`,
  `pointerEvents: none`.
  `backgroundImage: linear-gradient(180deg, rgba(5,7,6,0.45) 0%, transparent 25%, transparent 38%, rgba(5,7,6,0.85) 72%, colorBg0 100%), linear-gradient(90deg, rgba(5,7,6,0.5) 0%, transparent 35%)`.
- `.overlayBack` (top-left pill): `position: absolute`, `top: 24px`,
  `left: 28px`, `zIndex: 4`. `<IconBack>` + `"Back"` in inline-flex
  `columnGap: 8px`. `paddingTop/Bottom: 8px`, `paddingLeft: 12px`,
  `paddingRight: 16px`. `backgroundColor: rgba(0,0,0,0.45)`, border
  `colorBorder`, `borderRadius: 999px`. Mono 11px,
  `letterSpacing: 0.16em`, uppercase. Hover: `rgba(0,0,0,0.7)`, border
  → `colorGreen`, `color: colorGreen`. `aria-label="Back to home"`.
  Calls `onClose`.
- `.overlayClose` (top-right circle): `position: absolute`,
  `top: 24px`, `right: 28px`, `zIndex: 4`. 40×40, `borderRadius: 50%`,
  `rgba(0,0,0,0.45)`, border `colorBorder`. `<IconClose>`,
  `aria-label="Close details"`. Hover: `rgba(0,0,0,0.7)`, border →
  `colorGreen`. Calls `onClose`.
- `.overlayContent`: `position: absolute`, `left: 60px`,
  `right: 60px`, `bottom: 72px`, `zIndex: 3`, flex column
  `rowGap: 14px`, `maxWidth: 720px`.
- Chips row: resolution green chip + HDR chip (if hdr and not "—") +
  codec chip + IMDb badge+rating (if `film.rating !== null`) in
  `colorYellow` Mono 11px.
- Title: Anton 72px, `lineHeight: 0.95`,
  `letterSpacing: -0.02em`.
- Meta row: Mono 13px, `letterSpacing: 0.08em`, `colorTextDim`,
  uppercase. `{year} · {genre} · {duration}`.
- Director: 13px, `colorTextMuted`, `"Directed by "` +
  `<span colorText>{director}</span>`. Only when `film.director`.
- Plot: 15px, `lineHeight: 1.55`, `colorTextDim`, `maxWidth: 640px`.
  Only when `film.plot`.
- Actions row: flex, `columnGap: 20px`, `marginTop: 8px`. **Play CTA
  glass pill** — translucent white bg, `borderRadius: 999px`,
  `backdrop-filter: blur(20px) saturate(180%)`, beveled-light borders,
  Mono 12px uppercase, `paddingTop/Bottom: 14px`, `paddingLeft: 26px`,
  `paddingRight: 30px`. Hover: glass lights up green
  (`oklch(0.78 0.20 150 / 0.18)` bg, alpha-gradient green borders,
  green text + two-layer text-shadow glow, amplified outer shadows +
  32px + 80px green halos; icon gets green drop-shadow filters).
  Active: lift release + scale 0.98. Plus filename (Mono 10px,
  `colorTextFaint`).
- Play CTA: `<button onClick={playWithTransition}>` — wraps
  `document.startViewTransition(() => navigate("/player/{id}"))` with
  plain `navigate` fallback. NOT a `<Link>`.
- Scroll hint (`.scrollHint`): Mono 10px, positioned
  `bottom: -44px`, renders `"▾ scroll for suggestions"` when
  suggestions present, pulsing animation (1.8s, 0.4 → 0.85 opacity),
  `aria-hidden="true"`.
- View Transitions invariant: `.overlayPoster`
  `viewTransitionName: "film-backdrop"` must match Player `.backdrop`
  — if they diverge, the morph silently breaks.
- `.suggestions` section: rendered only when
  `suggestions.length > 0`, **after** the `.hero` closes (siblings
  under `.overlay`, not nested).
- Padding: `paddingTop: 40px`, `paddingBottom: 60px`,
  `backgroundColor: colorBg0` (same as overlay).
- `<PosterRow title="You might also like">` component containing
  `<FilmTile>` cards per suggestion.
- FilmTile click: calls `onSelectSuggestion(id)` if provided, else
  navigates to `/player/{id}`.

#### Suggestion picker

- Called by Library page when rendering overlay:
  `const suggestions = pickSuggestions(selectedFilm, films)`.
- Signature: `function pickSuggestions(film: Film, all: Film[]): Film[]`.
- Algorithm: ranks all films except the input by score:
  - Self-exclusion: skip the input film.
  - Director match: same director, +50.
  - Profile match: same library, +8.
  - Genre overlap: for each token > 2 chars in the film's genre, +12 if
    found in candidate's genre.
  - Resolution match: same resolution, +2.
  - Sort descending by score, cap at 8 results.
- Usage:
  `<FilmDetailsOverlay ... suggestions={pickSuggestions(selectedFilm, films)} onSelectSuggestion={(id) => openFilm(id)} />`.

#### Production wiring

- "Continue watching": `watchlist.filter(w => w.progress !== undefined)`,
  resolved to Film via `getFilmById`. Backend: watchlist join with
  job/progress.
- "New releases": resolved from `newReleaseIds` constant. Backend:
  CMS-curated row or release-date sorted query.
- "Watchlist": `watchlist.filter(w => w.progress === undefined)`.
  Backend: items with no playback progress.
- Search: wired to backend query / Relay refetch (currently client-side
  only).
- `?q=<query>` URL param not yet wired in lab — production should write
  `?q=` so the filtered view is shareable/bookmarkable.

### MediaKindBadge

From [`MediaKindBadge.md`](../client/Components/MediaKindBadge.md). Remaining work:

- Component signature: `{ kind: MediaKind; variant?: "tile" | "row" }`
  (variant defaults to `"row"`).
- **Tile variant:**
  - `position: absolute`, `top: 8px`, `left: 8px`, `zIndex: 2`.
  - 22×22 square, `borderRadius: 2px`.
  - Glass treatment: transparent bg, `border: 1.5px solid colorGreen`,
    `backdropFilter: blur(8px)`.
  - `display: flex`, `alignItems: center`, `justifyContent: center`
    (icon centred).
  - Series: `<IconTv>` (22×22, green). Movie: **not rendered** at all.
  - `aria-label="TV series"` for series (no aria for movies).
- **Row variant:**
  - 12×12 icon, inline-flex, no chrome.
  - Series: `<IconTv>` (12×12, green). Movie: `<IconFilm>` (12×12,
    muted).
  - `aria-hidden="true"` for both kinds (title text disambiguates).
- Wire to real `MediaKind` discriminator enum.

### PosterRow

From [`PosterRow.md`](../client/Components/PosterRow.md). Remaining work:

- Import `TILE_WIDTH`, `TILE_GAP`, `TILE_STRIDE` from FilmTile.
- Container: flex column, `rowGap: 12px`.
- Header: Mono 11px uppercase, `colorTextDim`, renders `title` prop.
- Frame: `position: relative` (arrow container).
- Track: `display: flex`, `columnGap: 16px`, `overflowX: auto`,
  `overflowY: hidden`, scrollbar hidden, `scrollSnapType: x proximity`.
- Track children (FilmTile): `scrollSnapAlign: start`.
- Left arrow: `position: absolute`, `left: -12px`,
  `top: calc(50% - 24px)`, 44×44 circular glass pill, `<IconBack>`,
  `aria-label="Previous"`.
- Right arrow: `position: absolute`, `right: -12px`, same styling,
  `<IconChevron>`, `aria-label="Next"`.
- Arrow glass styling: `backgroundColor: rgba(8,11,10,0.65)`,
  `backdropFilter: blur(10px) saturate(1.4)`, border `colorBorder`,
  `borderRadius: 50%`, `zIndex: 4`.
- Arrow hover: `backgroundColor: rgba(8,11,10,0.85)`, border/color →
  `colorGreen`, `scale(1.06)`, smooth transitions.
- Arrow visibility: `hasPrev` and `hasNext` state based on scroll
  position (tolerance 4px).
- Scroll listener: update `hasPrev`/`hasNext` on scroll +
  ResizeObserver on track resize.
- Page size function:
  `Math.max(1, Math.floor(trackWidth / TILE_STRIDE)) * TILE_STRIDE`.
- On left arrow click: RAF-animate scroll left by page size (720ms
  easeInOutCubic).
- On right arrow click: RAF-animate scroll right by page size (720ms
  easeInOutCubic).
- Render `children` directly inside the track (no internal data
  ownership; caller owns `<FilmTile>` array + click handlers).
- Cleanup on unmount: remove scroll listener, disconnect ResizeObserver.

### ProfileForm

From [`ProfileForm.md`](../client/Components/ProfileForm.md). Remaining work:

- Flex column full-height layout with header clearance
  (`paddingTop: tokens.headerHeight`, `boxSizing: border-box`).
- Breadcrumb path rendering from `crumbs` array prop.
- Eyebrow (Mono green uppercase) from `eyebrow` prop.
- Title (Anton 96px uppercase) from `title` prop — caller responsible
  for line breaks.
- Optional subtitle (14px body dimmed) from `subtitle` prop.
- Name field: label + input with placeholder, focus border green.
- Path field: `pathSection` relative container with `pathRow` (input +
  Browse button).
- Browse button: folder icon + "Browse" text, Mono uppercase,
  transparent bg at rest; green border + green text on hover; green bg
  when active.
- DirectoryBrowser popover: `position: absolute` below input,
  `top: 100%`, `left: 0`, `right: 0`, `zIndex: 20`; renders
  `<DirectoryBrowser initialPath={path}>` with `onSelect(picked)`
  updating input and closing popover.
- Media type segmented control: two segments (MOVIES / TV_SHOWS) with
  preset buttons.
- Segment hint line: Mono 9px muted, text changes per segment:
  - MOVIES: "Each video file is matched as a single film."
  - TV_SHOWS: "Files are grouped by show, then by season folder. Episode numbers are read from filenames (S01E03, 1x03, etc.)."
- Extension chip grid: toggles for each extension, preset buttons for
  standard sets.
- Form validation: require name and path; show error on submit if
  validation fails (mock).
- Delete confirm panel (edit mode only): red-bordered, inline confirm
  with message + Delete/Cancel buttons.
- Footer buttons: "← Back" (link to `/profiles`) + "Create" / "Save"
  (textAction style); red "Delete" button in edit mode.
- On submit: validate, then call `createProfile` / `updateProfile` /
  `deleteProfile` mutations (or navigate to `/profiles` if mutations
  are mocked).
- Wire DirectoryBrowser to real GraphQL `listDirectory(path)` query
  (currently mocked with offline filesystem).
- Wire form submission to actual GraphQL mutations (replace mock
  navigation).

### ProfileRow

From [`ProfileRow.md`](../client/Components/ProfileRow.md). Remaining work:

- Import `PROFILE_GRID_COLUMNS` from `pages/Profiles/grid.ts`.
- 5-column grid: `gridTemplateColumns: PROFILE_GRID_COLUMNS`.
- Row: `padding: 11px 24px`, `columnGap: 16px`, `cursor: pointer`,
  `background: var(--surface)` when expanded.
- Column 1 (chevron): `<IconChevron>`, `transform: rotate(90deg)` when
  expanded, 0.15s transition.
- Column 2 (name+path): flex column `rowGap: 2px`; name 13px white;
  path Mono 10px muted.
- Column 3 (match bar):
  - When scanning: spinner (10×10, green border-top-transparent, 0.9s
    linear spin) + label `"{done}/{total}"` (Mono 10px green).
  - Otherwise: 3px progress bar (dark bg, green or yellow fill) + label
    `"{round(matchPct)}%"` (yellow if unmatched, else muted).
- Column 4 (size): Mono 11px, `color: var(--text-dim)`, right-aligned.
- Column 5 (actions): Mono 9px muted at rest:
  - While scanning: `"SCANNING…"` text (non-interactive).
  - Otherwise: `.editLink` (green Mono 9px, `letterSpacing: 0.16em`,
    underline 3px offset, hover white), navigates to
    `/profiles/:profileId/edit`.
  - EDIT link uses `e.stopPropagation()` to prevent toggle on click.
- Expanded children: rendered only when
  `expanded && children.length > 0`, in a `paddingLeft: 30px`,
  `background: var(--bg-1)` container.
- Click row (except EDIT link): calls `onToggleExpand(profile.id)`.
- Wire to real Profile data model (replace mock data).

### Profiles

From [`Profiles.md`](../client/Components/Profiles.md). Remaining work:

- Split-body grid: `1fr 0px 0px` closed,
  `1fr 4px <paneWidth>px` open, with `transitionSlow` ease;
  `paddingTop: tokens.headerHeight`, `boxSizing: border-box` (page
  manages header clearance).
- `useSplitResize(defaultPaneWidth)` for drag-resize handle +
  `isResizing` no-transition state.
  `defaultPaneWidth = Math.floor(window.innerWidth * 0.5)` via
  `useMemo([])`. Hook constants: `MIN_PANE_WIDTH=240`,
  `MAX_PANE_WIDTH=1200`.
- First-mount `useEffect` pre-selects the first matched movie
  (`films.find(f => f.kind === "movie" && f.matched)`) via
  `setParams({ film }, { replace: true })`. Skip when `?film` is
  already present or `?empty=1` is set. Run once.
- Breadcrumb path with scanning indicator (page opens here — no hero
  above it).
- Search bar: `display: flex`, `columnGap: 12px`,
  `paddingTop/Bottom: 8px`, `paddingLeft/Right: 16px`,
  `focus-within borderColor: colorGreen`.
- `<IconSearch>` icon at `colorGreen`, `flexShrink: 0`.
- Search input: Mono 12px, transparent bg, placeholder
  `"Search films, directors, genres in every profile…"`,
  `aria-label="Search profiles"`.
- Match count display (shown when `isSearching`): Mono 10px green
  uppercase,
  `"{matchCount} {match/matches} · {visibleProfiles.length} {profile/profiles}"`.
- Clear button (shown when `isSearching`): 20×20, `<IconClose 12×12>`,
  click resets `search` state.
- **Auto-expand behavior:** when `isSearching`, force-expand all
  profiles (toggle disabled); when not searching, revert to manual
  control.
- **No-matches state:** when `isSearching && visibleProfiles.length === 0`,
  show `"No films match \"{search.trim()}\""`.
- `filmMatches(film, query)` helper: checks title / filename / director
  / genre (case-insensitive substring match).
- 5-column ProfileRow: chevron / name+path / match-bar / size / actions.
- Match bar: green (or yellow if unmatched) progress fill OR spinner
  during scan.
- Expanded ProfileRow shows nested FilmRow children with `bg-1`
  background.
- FilmRow at-rest: `background: transparent`,
  `borderLeft: 2px solid transparent`; `:hover`:
  `background: rgba(232, 238, 232, 0.05)`,
  `borderLeftColor: var(--border)`.
- FilmRow selected state: `background: var(--green-soft)`,
  `borderLeft: 2px solid var(--green)`, `:hover` locked to green-soft
  (no flicker).
- Poster thumbnail (`filmThumbBtn`): 26×38 button, no visible bg;
  contains image + hover overlay; `:hover` adds `scale(1.05)` + green
  shadow.
- Hover overlay (`filmThumbHover`): absolute fill, flexed center,
  displays `▶` in green, `backgroundColor: rgba(5, 7, 6, 0.55)`,
  `opacity: 0` → `1` on parent `:hover`.
- Poster button navigates to `/player/:id` on click.
- Right cell: one text-link button (`filmEditAction`, Edit only — no
  Play link).
- `filmEditAction`: white Mono 9px underline text, faint white
  underline; hover white → green; calls `onEdit(film.id)`.
- Edit button uses `e.stopPropagation()` so click doesn't toggle row
  selection.
- URL pane state: `?film=<id>` (view mode) or `?film=<id>&edit=1`
  (edit mode); toggle off on second click in view mode.
- Pre-expand profile containing the deep-linked film.
- Pass FilmRow props: `onOpen={(id) => openFilm(id)}`,
  `onEdit={(id) => editFilm(id)}`.
- Pass DetailPane props: `initialEdit={editParamSet}`,
  `onEditChange={handleEditModeChange}`, `onClose={closePane}`.
- `editFilm(id)` helper sets URL params to
  `{ film: id, edit: "1" }` → DetailPane mounts in edit mode.
- DetailPane `onEditChange` callback syncs URL: `editing=false` removes
  `edit` param, `editing=true` adds it.
- Footer: counts in Mono uppercase
  `{profiles} PROFILES · {films} FILMS · {shows} SHOWS ({episodes} EPS) · {unmatched} UNMATCHED`
  + `+ NEW PROFILE` CTA wired to `/profiles/new` (or create-profile
  mutation in GraphQL).
- Episode counts aggregated across all series in all profiles; SHOWS
  section omitted if no series present.
- Empty state: `?empty=1` design-lab toggle renders watermark + content
  section with headline/rule/body/CTA + hint.
- Production implementation
  (`client/src/pages/Profiles/` + `client/src/components/` split).

### SearchSlide

From [`SearchSlide.md`](../client/Components/SearchSlide.md). Remaining work:

- Container: `flexGrow: 1`, flex column, `rowGap: 20px`, Mono,
  `color: colorText`, `paddingTop: 12px`.
- Eyebrow: Mono 11px uppercase, green, dynamic text pattern (no query /
  query / query+filters).
- Eyebrow accent span (filter count): white text.
- Prompt row: flex, `columnGap: 16px`, `alignItems: baseline`,
  Mono 56px, `lineHeight: 1`, `letterSpacing: -0.01em`.
- Caret: green `">"`, fixed.
- Text: white, `display: inline-flex`, `overflowX: hidden`,
  `whiteSpace: nowrap`, renders `query.trim()` or empty.
- Cursor: green block `width: 12px`, `height: 0.85em`,
  `boxShadow: 0 0 6px colorGreen, 0 0 14px colorGreenGlow`; pulsing
  animation 1.05s ease-in-out
  (`scaleY(1)` → `scaleY(0.86)` at 50%).
- Cursor always visible (no conditional render).
- Status row: Mono 12px, `letterSpacing: 0.06em`, flex row wrap,
  `columnGap: 10px`, `rowGap: 6px`, `colorTextDim`.
- Status with query:
  `"{resultCount} of {totalMatched} match(es)" · "{profilesMatched} profile(s)"`
  + filter indicator if active (green accent span).
- Status without query, no filters: italic hint text
  `"type to search films, directors, genres"` in `colorTextMuted`.
- Status without query, filters active:
  `"{resultCount} of {totalMatched} films · {profilesMatched} profile(s) · {activeFilterCount} filter(s) on"`
  (normal text, not hint).
- Status accent span (filter count): green text.
- Actions row: `marginTop: auto`, flex, `columnGap: 20px`,
  `paddingTop: 16px`, `flexWrap: wrap`.
- Primary action: `"[F] Filter"` green underlined text (Mono 13px
  uppercase), hover white; calls `onOpenFilter()`.
- Secondary action: `"[ESC] Clear"` grey underlined text (Mono 12px
  uppercase), hover white; calls `onClear()`.
- Wire `onOpenFilter` and `onClear` callbacks to parent Library state
  machine.

### SeasonsPanel

From [`SeasonsPanel.md`](../client/Components/SeasonsPanel.md). Remaining work:

- `seasons: Season[]` prop with `seasonNumber`, `episodes` shape.
- `defaultOpenFirst?: boolean` prop — defaults to false.
- `accordion?: boolean` prop — defaults to false; when true, opening a
  season closes any others; closing the only open leaves none open.
- `activeEpisode?: { seasonNumber; episodeNumber }` prop — when
  provided, auto-expand that season on mount (overrides both
  `defaultOpenFirst` and `accordion`).
- `onSelectEpisode?: (seasonNumber, episodeNumber) => void` prop —
  when provided, episode rows become interactive.
- Local `isOpen` state per season; compute auto-expand logic: if
  `activeEpisode` provided, open that season; else if
  `defaultOpenFirst` true, open season 0; else all closed.
- Accordion toggle logic: when `accordion === true` and user clicks a
  season header, close all other seasons before opening the clicked
  one; clicking the open season closes it (leaves panel collapsed).
- Season header: 3-column grid (chevron, title + meta, status badge +
  progress bar).
- Season title: Anton 13px uppercase `"Season {N}"`.
- Episode count line: Mono 10px `"{onDisk} of {total} on disk"`.
- Progress bar: 80px width, 3px tall, dark track, coloured fill
  (green/yellow/grey based on status).
- Status pill: Mono 8px, uppercase `ON DISK` / `PARTIAL` / `MISSING`
  with colour + background per status.
- Episodes list: rendered only when `isOpen === true`, flex column
  indented at `paddingLeft: 40px`.
- Episode row: 3-column grid (code, title, availability dot).
- Episode row interactive (when `onSelectEpisode` provided): if
  `onDisk === true` render as `<button>`; else render as `<div>`
  (non-interactive).
- Episode code: Mono 10px, uppercase `S{pad}E{pad}` (zero-padded).
- Episode title: 12px body font, truncate if too long; fallback to
  `"Episode {N}"` if null.
- Availability dot: 8×8 circle, filled green if `onDisk`, outlined grey
  if missing.
- Active episode styling (when `activeEpisode` matches and
  `onSelectEpisode` provided): "● PLAYING" eyebrow above title, green
  left-rail (`borderLeftColor: var(--green)`,
  `backgroundColor: var(--green-soft)`), `aria-current="true"` on
  button.
- Chevron rotation: transform 0° (right) → 90° (down) on
  expand/collapse.
- Click season header to toggle `isOpen` state.
- Click available episode (when `onSelectEpisode` provided) calls the
  handler.
- Hover subtle background tint on season headers + episode rows
  (non-interactive episodes remain non-hoverable).
- Wire to real `Season` + `Episode` data model (replace mock data).
