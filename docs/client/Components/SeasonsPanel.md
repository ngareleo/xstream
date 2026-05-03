# SeasonsPanel

Reusable season → episode browser. Renders an accordion of seasons with expandable episodes. Used inline in FilmRow expansion, DetailPane series section, FilmDetailsOverlay seasons rail, and Player side panel. Supports single-open (accordion mode) for narrow contexts and multi-open for detail views.

**Source:** `client/src/components/seasons-panel/`
**Used by:** FilmRow, DetailPane, FilmDetailsOverlay, Player page.

## Role

Presentational accordion component for series browsing. Displays seasons with collapsible episodes, progress indicators (green complete / yellow partial / grey missing), and per-episode on-disk status. Owns no data — parent supplies seasons and manages selection/playback callbacks.

## Props

| Prop | Type | Notes |
|---|---|---|
| `video` | `SeasonsPanel_video$key` | Relay fragment key. The fragment traverses to `Video.show.seasons` — the video must be an episode file (or a movie video, in which case the panel renders empty). |
| `defaultOpenFirst` | `boolean` | If true, first season opens expanded on mount (default: false). |
| `accordion` | `boolean` | If true, opening a season closes others; single-open mode (default: false). |
| `activeEpisode` | `{ seasonNumber; episodeNumber }` | When provided, marks active episode + auto-expands its season (Player use only). |
| `onSelectEpisode` | `(seasonNumber, episodeNumber) => void` | Available episode click handler (Player use only). |

## Fragment

```graphql
fragment SeasonsPanel_video on Video {
  show {
    seasons {
      seasonNumber
      ...Season_season
    }
  }
}
```

The component reads `data.show?.seasons ?? []` — movies (`show === null`) render an empty panel.

## Layout & styles

### Container

- `display: flex`, `flexDirection: column`, `rowGap: 12px`.
- `width: 100%`, no padding or margins (parent controls spacing).

### Season header (`.seasonHeader`)

- `display: grid`, `gridTemplateColumns: 28px 1fr auto`, `columnGap: 12px`, `alignItems: center`.
- `paddingTop/Bottom: 10px`, `paddingLeft/Right: 12px`.
- `backgroundColor: transparent` at rest; hover: `rgba(232, 238, 232, 0.04)`.
- `cursor: pointer`, `borderRadius: 3px`, transition `background-color 0.15s`.

#### Column 1: Chevron (`.seasonChevron`)

- 16×16, `color: tokens.colorText`.
- `<IconChevron>` rotated 0° (right) when closed, 90° (down) when expanded.
- Transition: `transform 0.2s ease-out`.

#### Column 2: Season metadata (`.seasonMeta`)

- Flex column, `rowGap: 4px`.

##### Season title (`.seasonTitle`)

- Anton 13px, `letterSpacing: -0.01em`, uppercase, `color: tokens.colorText`.
- Renders `"Season {seasonNumber}"` (1-indexed).

##### Episode count line

- Mono 10px, `color: tokens.colorTextMuted`, `letterSpacing: 0.05em`.
- Renders `"{episodesOnDisk} of {totalEpisodes} on disk"`.

#### Column 3: Status badge + progress bar (`.seasonStatus`)

- Flex column, `rowGap: 4px`, `alignItems: flex-end`, `flexShrink: 0`.

##### Progress bar (`.progressBar`)

- `width: 80px` (fixed), `height: 3px`.
- Track: `backgroundColor: rgba(0,0,0,0.3)`.
- Fill (`progressFill`): `width: {episodesOnDisk / totalEpisodes * 100}%`, colour based on status:
  - **Complete:** `tokens.colorGreen`.
  - **Partial:** `oklch(0.70 0.23 62)` (yellow/gold).
  - **Missing:** `rgba(200,200,200,0.2)` (grey).
- Transition: `width 0.2s ease`.

##### Status pill (`.statusPill`)

- Mono 8px, `letterSpacing: 0.1em`, uppercase.
- Padding: 2px 6px, `borderRadius: 2px`.
- **ON DISK:** `backgroundColor: tokens.colorGreen`, `color: tokens.colorGreenInk`.
- **PARTIAL:** `backgroundColor: oklch(0.70 0.23 62 / 0.15)`, `color: oklch(0.70 0.23 62)`.
- **MISSING:** `backgroundColor: rgba(200,200,200,0.1)`, `color: tokens.colorTextMuted`.

### Episodes list (`.episodesList`)

- Rendered only when season is expanded.
- Flex column, `rowGap: 0`.
- `paddingLeft: 40px` (indented under header).

### Episode row (`.episodeRow`)

- Grid `gridTemplateColumns: 60px 1fr auto`, `columnGap: 12px`, `alignItems: center`.
- `paddingTop/Bottom: 6px`, `paddingLeft/Right: 12px`.
- `backgroundColor: transparent` at rest; hover: `rgba(232, 238, 232, 0.03)`.
- `fontSize: 12px`, `lineHeight: 1.3`.
- When `onSelectEpisode` provided AND `onDisk === true`: renders as `<button>` (interactive).
- When `onDisk === false`: renders as `<div>` (non-interactive).

#### Column 1: Episode code (`.episodeCode`)

- Mono 10px, `letterSpacing: 0.08em`, uppercase, `color: tokens.colorTextMuted`.
- Renders `"S{seasonPad}E{episodePad}"` (e.g. S01E03, zero-padded).
- `flexShrink: 0`, `width: 60px`.

#### Column 2: Episode title (`.episodeTitle`)

- 12px body font, `color: tokens.colorText`.
- Single line, truncate if longer: `textOverflow: ellipsis`, `whiteSpace: nowrap`, `overflow: hidden`.
- Falls back to `"Episode {episodeNumber}"` if title is null.

#### Column 3: Availability dot (`.availabilityDot`)

- 8×8 circle, `borderRadius: 50%`, `flexShrink: 0`.
- **On disk:** `backgroundColor: tokens.colorGreen`, `opacity: 1` (solid green).
- **Missing:** `border: 1px solid tokens.colorTextMuted`, `backgroundColor: transparent`, `opacity: 0.7` (outline).

### Active episode styling

When `activeEpisode` matches and `onSelectEpisode` is provided:
- Row renders with green left-rail (`borderLeftColor: var(--green)`, `backgroundColor: var(--green-soft)`).
- "● PLAYING" eyebrow renders above the title (Mono, green).
- Button has `aria-current="true"`.

## Behaviour

### Expansion state

On mount:
- If `activeEpisode` provided: find season containing that episode and open it (overrides both `defaultOpenFirst` and `accordion`).
- Else if `defaultOpenFirst === true`: open season 0 (first); all others closed.
- Else: all seasons closed.

Click season header toggles `isOpen`:
- **Multi-open** (`accordion === false`): toggling doesn't affect others. Multiple seasons can be open.
- **Accordion** (`accordion === true`): opening closes any other previously-open season. Closing the only open leaves none open.

### Status calculation

For each season:
- `episodesOnDisk = episodes.filter(e => e.onDisk).length`.
- `totalEpisodes = episodes.length`.
- **Status:**
  - **COMPLETE** if `episodesOnDisk === totalEpisodes`.
  - **PARTIAL** if `0 < episodesOnDisk < totalEpisodes`.
  - **MISSING** if `episodesOnDisk === 0`.

### Episode interaction

When `onSelectEpisode` is provided:
- **Available episodes** (`onDisk === true`): row is a `<button>` with `aria-label="Play SxxEyy: Title"`. Click calls handler.
- **Active episode** (when `activeEpisode` matches): `aria-current="true"`, shows "● PLAYING" eyebrow, green left-rail, auto-expands season on mount.
- **Missing episodes** (`onDisk === false`): row is non-interactive `<div>`, visually muted.

## Notes

Outstanding work tracked in [`Outstanding-Work.md`](../../release/Outstanding-Work.md#seasons-panel).
