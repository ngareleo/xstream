# VideoArea

Playback viewport shell. Renders backdrop poster with playback chrome (topbar, bottom controls). Manages poster fade-out transition when video starts playing, letterbox gradients, grain overlay, and metadata display (title, genre, episode badge for series). Primarily a layout container wiring VideoPlayer into the Player page's backdrop.

**Source:** `client/src/components/video-area/`
**Used by:** `PlayerContent` (fills entire viewport as sibling to SidePanel and EdgeHandle).

## Role

Orchestrates the visual presentation of playback. Renders a dimmed/contrasted backdrop poster (with View Transitions name matching Library's equivalent for smooth morph between routes), layered with topbar (back button, play state + resolution badge), VideoPlayer component, and bottom chrome (title, metadata, progress bar, controls). Listens to `onStatusChange` from VideoPlayer to fade the poster when playback begins.

## Props

| Prop | Type | Notes |
|---|---|---|
| `video` | `VideoArea_video$key` | Relay fragment ref. Carries `title`, `durationSeconds`, `metadata`, `videoStream`, and spreads `...VideoPlayer_video`. |
| `seriesPick` | `SeriesPick \| null` | Episode metadata for series (seasonNumber, episodeNumber, episodeTitle, episodeDurationSeconds). Null for movies. |
| `controlsHidden` | `boolean` | When true, chrome fades out (opacity 0, pointerEvents none). Controls fade state with 0.3s transition. |
| `onBack` | `() => void` | Back button handler. Called by topbar and ControlBar back button (wired in parent). |

## Layout & styles

### Root container

- `position: absolute`, `inset: 0`, `backgroundColor: #000`, `overflow: hidden`.

### Backdrop poster (`.backdrop`)

- `position: absolute`, `inset: 0`, `width: 100%`, `height: 100%`, `objectFit: cover`.
- `filter: brightness(0.85) contrast(1.05)` — dimmed and punchy.
- **`viewTransitionName: "film-backdrop"`** — must match Library's `.overlayPoster` for View Transitions API morph.
- **Unmounts entirely when `playStatus === "playing"`** — not opacity-faded, but conditionally rendered `{playStatus !== "playing" && <Poster ... />}`. Once video frames are rendering, the component tree no longer includes the backdrop.
- `zIndex: 0`.

### Grain overlay (`.grain`)

- Full-area SVG fractal noise, `opacity: 0.18`, `mixBlendMode: overlay`, `pointerEvents: none`, `zIndex: 2`. Subtle texture layer.

### Letterbox gradients (`.letterTop`, `.letterBottom`)

Both fade with chrome (`controlsHidden`):
- **Top**: 80px tall, `linear-gradient(180deg, rgba(0,0,0,0.85), transparent)`, `zIndex: 3`.
- **Bottom**: 220px tall, `linear-gradient(0deg, rgba(0,0,0,0.92), transparent)`, `zIndex: 3`.
- Both applied `fadeClass` which applies `transitionProperty: opacity`, `transitionDuration: 0.3s`. When `controlsHidden`, `opacity: 0`, `pointerEvents: none`.

### Topbar (`.topbar`, `.fadeClass`)

- `position: absolute`, `top: 0`, `left: 0`, `right: 0`, `padding: 16px 26px`.
- `display: flex`, `alignItems: center`, `columnGap: 16px`, `color: #fff`, `zIndex: 10`.
- Fades with `controlsHidden` (0.3s opacity transition).
- **Back button** (`.topbarBtn`): Icon-only, `backgroundColor: transparent`, no border, `borderRadius: 999px`. At rest: `color: rgba(255,255,255,0.85)`, `filter: drop-shadow(0 2px 6px rgba(0,0,0,0.6))`. Hover: `color: #fff`, extra glow `drop-shadow(0 0 12px rgba(255,255,255,0.65))`. Active: `scale(0.94)`.
- **No status badge or spacer** — topbar contains only the back button. The right-side `"● PLAYING · S01E03 · 4K"` display has been removed.

### Bottom controls (`.titleOverlay`, `.fadeClass`)

- `position: absolute`, `bottom: 130px`, `left: 26px`, `right: 26px`, `zIndex: 9`, `pointerEvents: none`.
- Fades with controls (0.3s opacity transition).
- **Episode badge** (`.episodeBadge`, series only): `display: inline-flex`, `alignItems: center`, `columnGap: 10px`, `marginBottom: 10px`. Green text + `fontMono 12px uppercase`.
  - **Code** (`.episodeBadgeCode`): `S01E03` format, green-bordered chip, `backgroundColor: rgba(5, 7, 6, 0.55)`, green border, `borderRadius: radiusSm`.
  - **Title** (`.episodeBadgeTitle`): Episode title, white, `textTransform: none`.
- **Film title** (`.filmTitle`): `fontHead 64px`, uppercase, `textShadow: 0 4px 24px rgba(0,0,0,0.6)`, `marginBottom: 6px`.
- **Meta line** (`.filmMeta`): `fontMono 11px uppercase`, `color: rgba(255,255,255,0.7)`. For movies: `"year · genre · duration"`. For series: `"Season N · genre · episode-duration"`.

### Video wrapper (`.videoWrapper`)

- `position: absolute`, `inset: 0`, `zIndex: 1`. Contains VideoPlayer (Suspense-wrapped).

## Behaviour

### Backdrop unmount on play

- VideoPlayer calls `onStatusChange("playing")` when video element receives first frames.
- VideoArea sets `playStatus = "playing"`.
- Backdrop `<Poster>` component is conditionally unmounted: `{playStatus !== "playing" && <Poster ... />}`.
- Once video frames are rendering, the backdrop is removed from the DOM entirely.

### Episode code formatting

Helper `formatEpisodeCode(seasonNumber, episodeNumber)` pads both to 2 digits: `S01E03`, `S02E10`, etc.

### Chrome fade with `controlsHidden`

When PlayerContent sets `controlsHidden = true` (3000ms inactivity), VideoArea's topbar and bottom controls fade out via `mergeClasses(styles.fadeClass, controlsHidden && styles.fadeHidden)`. On wake (mouse/key activity), `controlsHidden = false` and controls fade back in.

## Data

- **Fragment**: Spreads `...VideoPlayer_video`. Carries `title`, `durationSeconds`, `metadata { title, year, genre, posterUrl }`.
- **Derived**: Episode code, formatted duration, metadata line text.

## Notes

- **View Transitions contract**: The `viewTransitionName: "film-backdrop"` on backdrop poster must exactly match Library page's `.overlayPoster` for the browser's View Transitions API to morph the poster between routes. If names diverge, morph silently degrades to plain cross-fade.
- **No click handlers on chrome**: Topbar/bottom controls are `pointerEvents: none` when faded out (chrome hidden), so clicks pass through to VideoPlayer beneath.
- **Series vs movie variants**: Episode badge and metadata line automatically switch based on presence of `seriesPick` prop.
