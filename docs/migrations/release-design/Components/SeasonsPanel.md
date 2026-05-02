# SeasonsPanel (component)

> Status: **done** (Spec) · **not started** (Production)
> Spec created: 2026-05-02 — Reusable season → episode browser. Renders an accordion of seasons with expandable episodes. Used inline in FilmRow expansion, DetailPane series section, and FilmDetailsOverlay seasons rail. Props: `seasons: Season[]`, `defaultOpenFirst?: boolean`. Each season shows a progress indicator (green complete, yellow partial, grey missing) and meta line (X of Y episodes on disk).
> Audited: 2026-05-02 — added Strings + Stories sections (M4 audit pass).

## Files

- `design/Release/src/components/SeasonsPanel/SeasonsPanel.tsx`
- `design/Release/src/components/SeasonsPanel/SeasonsPanel.styles.ts`

## Purpose

Reusable widget for browsing a TV series' seasons and their episodes. Collapsible season headers with per-season metadata (episode count, on-disk status) and expandable episode rows (title, code, duration, availability dot). Used in four contexts: (1) inline under a FilmRow when the user clicks the series chevron; (2) as a bounded card section in DetailPane for series films; (3) as a side-scrollable rail in FilmDetailsOverlay for series overlay hero; (4) as the main episode browser in the Player side panel when playing a series. **Single source of truth for series UI consistency across all entry points.** When used in the Player side panel with `activeEpisode` and `onSelectEpisode` props, episodes become interactive buttons and the active episode row is visually marked.

## Visual

### Container

- `display: flex`, `flexDirection: column`, `rowGap: 12px`.
- `width: 100%`.
- No padding or margins — parent controls spacing.

### Season header (`.seasonHeader`)

- `display: grid`, `gridTemplateColumns: 28px 1fr auto`, `columnGap: 12px`, `alignItems: center`.
- `paddingTop: 10px`, `paddingBottom: 10px`, `paddingLeft: 12px`, `paddingRight: 12px`.
- `backgroundColor: transparent` at rest; on `:hover`: `backgroundColor: rgba(232, 238, 232, 0.04)` (subtle tint).
- `cursor: pointer`.
- `borderRadius: 3px`.
- `transition: background-color 0.15s`.

#### Column 1: Chevron (`.seasonChevron`)

- 16×16, `color: tokens.colorText`, `flexShrink: 0`.
- `<IconChevron>` rotated 0° (right) when season closed, 90° when expanded.
- `transitionProperty: transform`, `transitionDuration: 0.2s`, `transitionTimingFunction: ease-out`.

#### Column 2: Season metadata (`.seasonMeta`)

- `display: flex`, `flexDirection: column`, `rowGap: 4px`.

##### Season title (`.seasonTitle`)

- Anton 13px, `letterSpacing: -0.01em`, uppercase, `color: tokens.colorText`.
- Renders `"Season {seasonNumber}"` (1-indexed).

##### Episode count + progress (`.seasonMeta`)

- Two lines or one, depending on context (inline or detail pane):
  - Mono 10px, `color: tokens.colorTextMuted`, `letterSpacing: 0.05em`.
  - Renders `"{episodesOnDisk} of {totalEpisodes} on disk"` or similar.

#### Column 3: Status badge + progress bar (`.seasonStatus`)

- Flex column, `rowGap: 4px`, `alignItems: flex-end`, `flexShrink: 0`.

##### Progress bar (`.progressBar`)

- `width: 80px` (fixed, used in all contexts), `height: 3px`.
- `backgroundColor: rgba(0,0,0,0.3)` (dark track).
- **Fill (`progressFill`):** `width: {episodesOnDisk / totalEpisodes * 100}%`, `backgroundColor` based on status:
  - **Complete** (all episodes on disk): `tokens.colorGreen`.
  - **Partial** (some but not all): `oklch(0.70 0.23 62)` (yellow/gold).
  - **Missing** (none on disk or just started): `rgba(200,200,200,0.2)` (grey/faint).
- `transition: width 0.2s ease` (smooth fill change on expand).

##### Status pill (`.statusPill`)

- Mono 8px, `letterSpacing: 0.1em`, uppercase, `paddingLeft: 6px`, `paddingRight: 6px`, `paddingTop: 2px`, `paddingBottom: 2px`, `borderRadius: 2px`.
- Text + background colour based on status:
  - **`ON DISK`** (all episodes present): `backgroundColor: tokens.colorGreen`, `color: tokens.colorGreenInk`.
  - **`PARTIAL`** (some present): `backgroundColor: oklch(0.70 0.23 62 / 0.15)`, `color: oklch(0.70 0.23 62)` (yellow tint).
  - **`MISSING`** (no episodes on disk): `backgroundColor: rgba(200,200,200,0.1)`, `color: tokens.colorTextMuted` (grey).

### Episodes list (`.episodesList`)

- Rendered only when season is expanded.
- `display: flex`, `flexDirection: column`, `rowGap: 0` (rows stack flush).
- `paddingLeft: 40px` (indented under the season header).

### Episode row (`.episodeRow`)

- `display: grid`, `gridTemplateColumns: 60px 1fr auto`, `columnGap: 12px`, `alignItems: center`.
- `paddingTop: 6px`, `paddingBottom: 6px`, `paddingLeft: 12px`, `paddingRight: 12px`.
- `backgroundColor: transparent` at rest; on `:hover`: `backgroundColor: rgba(232, 238, 232, 0.03)` (very subtle).
- `cursor: default` (non-interactive — no click target in this spec version).
- `fontSize: 12px`, `lineHeight: 1.3`.

#### Column 1: Episode code (`.episodeCode`)

- Mono 10px, `letterSpacing: 0.08em`, uppercase, `color: tokens.colorTextMuted`.
- Renders `"S{seasonPad}E{episodePad}"` — e.g. `S01E03`, `S02E10`.
- `flexShrink: 0`, `width: 60px`.

#### Column 2: Episode title (`.episodeTitle`)

- 12px body font, `color: tokens.colorText`.
- Single line; truncate if longer than container.
- `textOverflow: ellipsis`, `whiteSpace: nowrap`, `overflow: hidden`.
- Falls back to `"Episode {episodeNumber}"` if title is null (placeholder in mock data).

#### Column 3: Availability dot (`.availabilityDot`)

- 8×8 circle, `borderRadius: 50%`, `flexShrink: 0`.
- **On disk:** `backgroundColor: tokens.colorGreen`, `opacity: 1` (solid green dot).
- **Missing:** `border: 1px solid tokens.colorTextMuted`, `backgroundColor: transparent`, `opacity: 0.7` (dashed-outline effect; faint).

## Behaviour

### Props

- `seasons: Season[]` — array of season objects. Shape (inferred from mock data):
  ```ts
  interface Season {
    seasonNumber: number;         // 1-indexed
    episodes: Episode[];
  }

  interface Episode {
    episodeNumber: number;        // 1-indexed
    title?: string;               // optional; placeholder if null
    duration?: number;            // duration in seconds (optional)
    onDisk: boolean;              // true if file exists
  }
  ```

- `defaultOpenFirst?: boolean` — if true, the first season opens expanded on mount. Default is false (all collapsed). Used in DetailPane and FilmDetailsOverlay to auto-expand season 1; FilmRow inline expansion may leave all collapsed until the user clicks.

- `accordion?: boolean` — (NEW, optional) if true, opening a season automatically closes any previously-open season; closing the only open season leaves none open. Default is false (multi-open). When `accordion` is true AND `activeEpisode` is also provided, `activeEpisode` wins for the initial-expanded set and `defaultOpenFirst` is ignored. Used in Player side panel to keep the narrow rail uncluttered (single season visible at a time).

- `activeEpisode?: { seasonNumber: number; episodeNumber: number }` — (NEW, optional) when provided, identifies which episode is currently playing. That episode row renders with a green left-rail indicator (`borderLeftColor: var(--green)`, `backgroundColor: var(--green-soft)`) and displays a "● PLAYING" eyebrow above its title. The season containing the active episode auto-expands on mount, overriding `defaultOpenFirst`. Used only in Player side panel.

- `onSelectEpisode?: (seasonNumber: number, episodeNumber: number) => void` — (NEW, optional) when provided, AVAILABLE episode rows (where `onDisk === true`) render as `<button>` elements with `aria-current="true"` on the active episode (when `activeEpisode` matches); MISSING episodes remain non-interactive `<div>` elements. Clicking an available episode calls `onSelectEpisode(seasonNumber, episodeNumber)`. Not supplied in FilmRow / DetailPane / FilmDetailsOverlay contexts; supplied only in Player side panel.

### Expansion state

- Each season has a local `isOpen` boolean state.
- On mount: if `activeEpisode` is provided, find the season containing that episode and open it, overriding both `defaultOpenFirst` and `accordion`. If `defaultOpenFirst` is true and `activeEpisode` is not provided, season 0 (first) starts with `isOpen: true`; all others start closed. If neither is provided, all seasons start closed.
- Click on a season header toggles `isOpen` for that season:
  - **Multi-open mode** (`accordion === false` or not provided): toggling a season does not affect others. Multiple seasons can be open simultaneously.
  - **Accordion mode** (`accordion === true`): opening a season automatically closes any other previously-open season. Closing the only open season leaves the panel fully collapsed (no fallback to reopening).

### Status calculation

For each season, compute:

- `episodesOnDisk = episodes.filter(e => e.onDisk).length`.
- `totalEpisodes = episodes.length`.
- **Status:**
  - **COMPLETE** if `episodesOnDisk === totalEpisodes`.
  - **PARTIAL** if `0 < episodesOnDisk < totalEpisodes`.
  - **MISSING** if `episodesOnDisk === 0`.

Progress fill percentage: `(episodesOnDisk / totalEpisodes) * 100`.

### Interactive episodes (Player variant)

When `onSelectEpisode` is provided:
- **Available episodes** (`onDisk === true`): episode row is a `<button>` element with `aria-label="Play SxxEyy: Title"`. Click triggers `onSelectEpisode(seasonNumber, episodeNumber)`.
- **Active episode** (when `activeEpisode` matches): `aria-current="true"` is set on the button. Row displays a "● PLAYING" eyebrow above the title and renders with green left-rail (`borderLeftColor: var(--green)`, `backgroundColor: var(--green-soft)`). The season auto-expands on mount.
- **Missing episodes** (`onDisk === false`): episode row is a non-interactive `<div>` (not a button); cursor remains `default`; row is visually muted to indicate unavailability.

### Keyboard navigation

- Season headers are clickable buttons and respond to Enter / Space for expansion toggle (native `<button>` element handles this).
- When `onSelectEpisode` is provided, available episode buttons respond to Enter / Space to trigger the selection.

## Changes from Prerelease

This component is new in Release. Prerelease had no TV-show concept; SeasonsPanel is the first reusable widget for series navigation.

## Porting checklist (`client/src/components/SeasonsPanel/`)

- [ ] `seasons: Season[]` prop with `seasonNumber`, `episodes` shape
- [ ] `defaultOpenFirst?: boolean` prop — defaults to false
- [ ] `accordion?: boolean` prop — defaults to false; when true, opening a season closes any others; closing the only open leaves none open
- [ ] `activeEpisode?: { seasonNumber; episodeNumber }` prop — when provided, auto-expand that season on mount (overrides both `defaultOpenFirst` and `accordion`)
- [ ] `onSelectEpisode?: (seasonNumber, episodeNumber) => void` prop — when provided, episode rows become interactive
- [ ] Local `isOpen` state per season; compute auto-expand logic: if `activeEpisode` provided, open that season; else if `defaultOpenFirst` true, open season 0; else all closed
- [ ] Accordion toggle logic: when `accordion === true` and user clicks a season header, close all other seasons before opening the clicked one; clicking the open season closes it (leaves panel collapsed)
- [ ] Season header: 3-column grid (chevron, title + meta, status badge + progress bar)
- [ ] Season title: Anton 13px uppercase `"Season {N}"`
- [ ] Episode count line: Mono 10px `"{onDisk} of {total} on disk"`
- [ ] Progress bar: 80px width, 3px tall, dark track, coloured fill (green/yellow/grey based on status)
- [ ] Status pill: Mono 8px, uppercase `ON DISK` / `PARTIAL` / `MISSING` with colour + background per status
- [ ] Episodes list: rendered only when `isOpen === true`, flex column indented at `paddingLeft: 40px`
- [ ] Episode row: 3-column grid (code, title, availability dot)
- [ ] Episode row interactive (when `onSelectEpisode` provided): if `onDisk === true` render as `<button>`; else render as `<div>` (non-interactive)
- [ ] Episode code: Mono 10px, uppercase `S{pad}E{pad}` (zero-padded)
- [ ] Episode title: 12px body font, truncate if too long; fallback to `"Episode {N}"` if null
- [ ] Availability dot: 8×8 circle, filled green if `onDisk`, outlined grey if missing
- [ ] Active episode styling (when `activeEpisode` matches and `onSelectEpisode` provided): "● PLAYING" eyebrow above title, green left-rail (`borderLeftColor: var(--green)`, `backgroundColor: var(--green-soft)`), `aria-current="true"` on button
- [ ] Chevron rotation: transform 0° (right) → 90° (down) on expand/collapse
- [ ] Click season header to toggle `isOpen` state
- [ ] Click available episode (when `onSelectEpisode` provided) calls the handler
- [ ] Hover subtle background tint on season headers + episode rows (non-interactive episodes remain non-hoverable)
- [ ] Wire to real `Season` + `Episode` data model (replace mock data)

## Strings (`SeasonsPanel.strings.ts`)

| Key | Value | Used as |
|---|---|---|
| `seasonFormat` | `"Season {n}"` | Season header title |
| `onDiskFormat` | `"{onDisk} of {total} on disk"` | Episode count line |
| `episodeFormat` | `"Episode {n}"` | Title fallback when `episode.title` is null |
| `episodeCodeFormat` | `"S{ss}E{ee}"` | Episode code (zero-padded) |
| `statusOnDisk` | `"ON DISK"` | Status pill (complete) |
| `statusPartial` | `"PARTIAL"` | Status pill (some episodes) |
| `statusMissing` | `"MISSING"` | Status pill (no episodes) |
| `playingEyebrow` | `"● PLAYING"` | Active episode eyebrow (Player only) |
| `playAriaFormat` | `"Play {code}: {title}"` | aria-label on available episode buttons |

## Stories (`SeasonsPanel.stories.tsx`)

| Story | Setup | What it verifies |
|---|---|---|
| Closed | 3 seasons, none open | All chevrons right, no episodes visible |
| DefaultOpenFirst | `defaultOpenFirst: true` | Season 1 expands on mount |
| MultiOpen | user expands seasons 1 + 3 | Both stay open simultaneously |
| Accordion | `accordion: true`, expand 1, then 2 | Season 1 closes when season 2 opens |
| MixedStatus | season 1 complete, 2 partial, 3 missing | Three status pills + three fill colours |
| InteractivePlayer | `onSelectEpisode + activeEpisode` | Available episodes are buttons; active episode shows ● PLAYING + green left-rail |
| MissingEpisodes | one season with `onDisk: false` for all | Outline dots, non-interactive rows |

## Status

- [x] Designed in `design/Release` lab — SeasonsPanel component created 2026-05-02, PR #49. Reusable across FilmRow inline expansion, DetailPane series section, FilmDetailsOverlay seasons rail, and Player side panel. Season headers with collapsible episodes, progress indicators (green complete / yellow partial / grey missing), and per-episode on-disk status dots. Default-open-first option for use in detail surfaces. Later 2026-05-02 (same day, second pass): extended with `activeEpisode` + `onSelectEpisode` props for Player episode picker. When provided, available episodes render as buttons; the active episode shows a "● PLAYING" eyebrow and green left-rail; the season containing the active episode auto-expands on mount. Missing episodes remain non-interactive. 2026-05-02 (third pass): added `accordion?: boolean` prop for Player side-panel to enforce single-open behaviour (opening a season closes others). DetailPane and FilmDetailsOverlay use multi-open mode (default, false). Player side panel sets `accordion={true}` to prevent the narrow rail from becoming cluttered when the user browses across seasons.
- [ ] Production implementation

## Notes

- **Consistency across entry points:** All three surfaces (inline FilmRow, DetailPane card, FilmDetailsOverlay rail) render the same SeasonsPanel component — no parallel implementations.
- **Progress indicator:** The progress bar fill + status pill together convey at a glance whether a series is fully on-disk, partially, or missing. Colour coding (green/yellow/grey) is consistent with the design language elsewhere.
- **Episode availability:** The availability dot (filled green or outlined grey) quickly shows which episodes the user has vs. needs to acquire.
- **No episode interaction:** Episodes are display-only in this version. Click targets for playing an episode or opening episode detail are deferred to a future porting step (not in the initial Release design).
- **Indentation:** Episodes are indented 40px from the season header row to visually nest them inside the accordion structure.
