# PlayerContent

Playback page orchestrator. Manages chrome auto-hide state machine (3000ms inactivity), side-panel drawer (EdgeHandle + PlayerSidebar), cursor tracking, and episode parameter resolution for series. Routes URL search params (`?s=<season>&e=<episode>`) to episode selection. Thin wrapper that wires VideoArea, EdgeHandle, and PlayerSidebar into the Player page's viewport.

**Source:** `client/src/components/player-content/`
**Used by:** `PlayerPage` (the page-level wrapper, passed as the route `:filmId` fragment).

## Role

Glue layer between the Player page shell and playback components. Owns chrome visibility state machine (idle/loading/playing + 3000ms inactivity timer), cursor position tracking for EdgeHandle proximity effects, and series episode resolution logic. Delegates actual playback to VideoArea (which renders VideoPlayer), video controls to ControlBar (inside VideoPlayer), and side-panel content to PlayerSidebar.

## Props

| Prop | Type | Notes |
|---|---|---|
| `video` | `PlayerContent_video$key` | Relay fragment ref. Carries `id`, `title`, `mediaType`, `show.seasons.episodes` (for series — the season tree is reached via the new `Video.show` resolver, not `Video.seasons` which was removed in the Show-entity migration), and spreads `...VideoArea_video` and `...PlayerSidebar_video`. |

## Layout & styles

### Root shell (`.shell`, `.shellChromeHidden`)

- `position: fixed` (actually absolute in parent div that fills viewport), captures all mouse/keyboard events.
- `onMouseMove` → `handleMouseMove` (updates cursor, calls `wakeChrome()`).
- `onClick` → `wakeChrome()` (click anywhere wakes chrome).
- `onKeyDown` → `wakeChrome()` (keypress wakes chrome).
- `tabIndex: 0` for keyboard focus.
- **`.shell`**: Default state, `cursor: default`.
- **`.shellChromeHidden`**: Applied when `chromeHidden = true`, `cursor: none` (per Player page spec).

### Rendered children

- **VideoArea**: Fills entire viewport, controls fading based on `controlsHidden` prop.
- **EdgeHandle**: Rendered when `!panelOpen && !chromeHidden`. Self-hides via opacity outside 140px detection zone from right edge.
- **Panel scrim**: Transparent full-area overlay, `position: absolute`, `inset: 0`, `zIndex: 18`, rendered only when `panelOpen && !chromeHidden`. Click → `setPanelOpen(false)`.
- **PlayerSidebar**: Right-side 290px drawer, `position: absolute`, slides out off-screen when closed. Open state: `panelOpen && !chromeHidden`.

## Behaviour

### Chrome auto-hide state machine

- **Initial state**: `chromeHidden: false` (chrome visible).
- **Inactivity timer** (`INACTIVITY_MS = 3000`): When VideoPlayer's status is `"playing"`, `armInactivity()` schedules `setTimeout(() => setChromeHidden(true), 3000)`.
- **Wake events**: `onMouseMove`, `onClick`, `onKeyDown` all call `wakeChrome()` which:
  1. Sets `chromeHidden = false` (reveal chrome).
  2. Clears existing inactivity timer.
  3. Re-arms the timer.
- **Auto-hide only in playing state**: When VideoPlayer's status changes to `"idle"` or `"loading"`, `wakeChrome()` is called (via Player page effect) to ensure chrome is always visible during pause or loading.
- **Effect cleanup**: On unmount, clears any pending inactivity timer.

### Cursor tracking

- `cursor: { x: number, y: number }` state updated on every `onMouseMove`.
- Initial value: `{ x: window.innerWidth, y: window.innerHeight / 2 }` (right edge, center).
- Passed to `<EdgeHandle cursorX={cursor.x} cursorY={cursor.y} />` for proximity detection and animation.

### Series episode resolution

For `mediaType === "TV_SHOWS"`:
- Reads URL search params: `seasonParam = searchParams.get("s")`, `episodeParam = searchParams.get("e")`.
- Calls `resolveSeriesPick(seasons, seasonParam, episodeParam)` — a helper that:
  1. Parses season/episode params as integers (or null if absent).
  2. Finds the requested episode in the seasons array.
  3. Filters to AVAILABLE episodes (where `onDisk === true`).
  4. Falls back to the first available episode if params are missing or out-of-range.
  5. Returns `{ seasonNumber, episodeNumber, episodeTitle, episodeDurationSeconds }` or null.
- Result is `useMemo`-d on `[mediaType, seasons, seasonParam, episodeParam]`.
- Passed to VideoArea as `seriesPick` and to PlayerSidebar as `sidebarPick` (slightly different shape).

### Episode selection handler

- `selectEpisode(seasonNumber, episodeNumber)` called by PlayerSidebar's SeasonsPanel.
- Calls `setSearchParams({ s: String(sNum), e: String(eNum) }, { replace: true })`.
- `replace: true` keeps episode switches out of browser history (transient playback state, not navigation).
- URL change triggers `seriesPick` re-memo, which prompts VideoArea/VideoPlayer to reload at new episode.

### Side-panel toggle

- **Initial**: `panelOpen: false` (panel hidden).
- **EdgeHandle click**: Calls `onActivate()` callback → `setPanelOpen(true)`.
- **Panel close button**: Calls `onClose` prop → `setPanelOpen(false)`.
- **Panel scrim click**: Calls `setPanelOpen(false)`.
- **Panel visibility**: `panelOpen && !chromeHidden` — when chrome hides, panel slides off even if `panelOpen` is true. `panelOpen` state is preserved so panel reappears on wake.

### Navigation

- `goBackWithTransition()` wraps `navigate(-1)` inside `document.startViewTransition()` when available, falls back to plain `navigate(-1)`. Called by VideoArea Back button and PlayerSidebar Back button.

## Data

- **Fragment**: Carries `id`, `title`, `mediaType`, `show { seasons { seasonNumber, episodes { episodeNumber, title, durationSeconds, onDisk } } }`. Spreads `...VideoArea_video` and `...PlayerSidebar_video`.
- **Derived**: `seriesPick` computed via `resolveSeriesPick` helper (memoized on season/episode params and seasons data).

## Notes

- **Cursor tracking for EdgeHandle effects**: PlayerContent owns cursor position state so it can be passed to EdgeHandle's proximity animation without re-rendering the entire tree. EdgeHandle self-hides via opacity when outside detection zone, so it can be mounted unconditionally.
- **Series variant auto-resolution**: The `resolveSeriesPick` logic is deterministic — missing or invalid episode params always resolve to the same first-available episode, so the UI loads consistently even with an empty library.
- **Panel persistence across chrome hide**: When chrome auto-hides, the panel slides off (via CSS transform). When chrome wakes, the panel reappears immediately if `panelOpen` is still true. This preserves user intent (they wanted the panel open) while respecting the immersive auto-hide UX.
- **Inactivity only during playback**: The 3000ms inactivity timer only arms when VideoPlayer is in `"playing"` state. During `"idle"` (pause screen) or `"loading"` (buffering spinner), chrome stays visible and the timer is cleared.
