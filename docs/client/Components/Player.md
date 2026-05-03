# Player (page)

Full-screen playback interface. **Bypasses AppShell** — owns its own viewport
(100vw × 100vh black background). Displays a backdrop poster with video
playback chrome (topbar with back button, bottom controls with title/progress/buttons).
Right-side drawer reveals on mouse-proximity; auto-hides chrome on inactivity.
Supports both movies and series (with episode picker via SeasonsPanel).

**Source:** `client/src/pages/player-page/`
**Used by:** Router as `/player/:filmId` route (with optional `?s=<season>&e=<episode>`
for series).

## Role

Full-screen playback shell. Renders a poster background with playback chrome
(responsive to inactivity). Manages state machine (idle → loading → playing),
chrome auto-hide (3000ms inactivity), cursor tracking, and side-panel drawer
(revealed by right-edge handle). For series, accepts URL search params to
resolve the current episode; renders episode metadata and SeasonsPanel in the
drawer instead of UP NEXT + watchlist rows.

## Props

None — the page is a route shell. Accepts route param `filmId` and optional
search params `?s=<season>&e=<episode>`. Manages playback state locally via
component state + services.

## Layout & styles

### Outer shell (`.shell` / `.shellChromeHidden`)

- `width: 100vw`, `height: 100vh`, `backgroundColor: #000`, `position:
  relative`, `overflowX/Y: hidden`.
- **No grid** — VideoArea fills the viewport; SidePanel and EdgeHandle are
  absolutely-positioned siblings.
- `.shell`: `cursor: default`.
- `.shellChromeHidden`: `cursor: none`.
- Applied as `mergeClasses(styles.shell, chromeHidden && styles.shellChromeHidden)`.

### VideoArea

Fills entire 100vw × 100vh shell. Contains poster backdrop, topbar, bottom
controls, grain layer, loading/idle overlays, and letterbox gradients.

- **Background**: `<Poster>` filled `inset: 0, object-fit: cover`, `filter:
  brightness(0.85) contrast(1.05)`. The `.backdrop` Griffel class carries
  **`viewTransitionName: "film-backdrop"`** (must stay in sync with Library's
  `.overlayPoster`).
- **Grain layer**: `.grain-layer` utility, `opacity: 0.18`, `mix-blend-mode:
  overlay`.
- **Letterbox gradients** (fade with chrome auto-hide):
  - Top: 80px tall, `linear-gradient(180deg, rgba(0,0,0,0.85), transparent)`.
  - Bottom: 220px tall, `linear-gradient(0deg, rgba(0,0,0,0.92), transparent)`.

### Topbar (fades with chrome)

- `padding: 16px 26px`. Icon-only Back button on left (`<IconBack>` only, no
  text label, transparent bg). At rest: `color: rgba(255,255,255,0.85)` +
  `filter: drop-shadow(0 2px 6px rgba(0,0,0,0.6))` for legibility. Hover:
  `color: #fff` + extra `drop-shadow(0 0 12px rgba(255,255,255,0.65))` glow.
  Active: `scale: 0.94`.
- Right side: Status eyebrow showing `"● PLAYING"` or `"○ PAUSED"` + resolution
  + HDR/codec (e.g., `"● PLAYING · 4K · HDR10"`).
- **Series variant**: Episode code injected between play state and resolution
  (e.g., `"● PLAYING · S01E03 · 4K · HDR10"`).

### Bottom controls (fade with chrome)

- `padding: 20px 26px 24px`. Title in Anton 64px / `text-shadow: 0 4px 24px
  rgba(0,0,0,0.6)` / uppercase.
- Eyebrow row (Mono 11px uppercase): `{year} · {genre} · {duration}` (movie)
  or `Season N · {genre} · {episode-duration}` (series).
- **Series variant**: Episode badge (NEW) above title — green-bordered chip with
  episode code (`S01E03`) + episode title (body font, regular).
- Progress bar row: timestamp `HH:MM:SS` + 3px tall bar with `colorGreen` fill /
  `box-shadow: 0 0 12px colorGreen`. Track: `rgba(255,255,255,0.18)`.
- Control row: −10s / play-pause / +10s / volume / resolution chip / fullscreen
  button.

### Idle overlay (when `state !== "playing"`)

- Full-area `<button onClick={onPlay}>`, `background: rgba(0,0,0,0.35)`.
- **Idle state**: 88×88 glass circle play button. `backgroundColor:
  rgba(255,255,255,0.12)`, `backdropFilter: blur(20px) saturate(180%)`,
  white-translucent borders (beveled-light), layered inset highlights + drop
  shadow (iOS-26 Liquid Glass inspired). `<IconPlay>` rendered at 40×40px
  with **engraved** treatment: `color: rgba(255,255,255,0.55)` + paired
  drop-shadows (light below, dark above) for recessed-into-glass illusion.
  - **Idle pulse** (NEW): When idle, the play disc gains `ctrlBtnPlayIdle`
    class with animation: scale `1 → 1.04 → 1`, `boxShadow` inflates from
    `4px green-soft` to `22px colorGreenGlow + 32px colorGreenSoft`, duration
    2.4s ease-in-out infinite. On `:hover` (always-on): scale 1.06 + 28px
    glow. On `:active`: scale 0.96. Signals readiness without forcing
    interaction.
- **Loading state**: 56×56 circular spinner with green top arc, 0.9s linear spin.

### SidePanel (right-side drawer)

- 290px wide, `background: colorBg1`, `border-left: 1px solid colorBorder`.
- `position: absolute, top: 0, right: 0, bottom: 0, zIndex: 20`.
- `transform: translateX(0)` ↔ `translateX(100%)` + opacity 1↔0 (0.3s ease).
- `boxShadow: -12px 0 32px rgba(0,0,0,0.45)` for separation from video.
- `aria-hidden={!open}`.
- Top-right `×` close button (`panelCloseBtn`, 26×26 circle) calls `onClose`.

### Panel header (`.sidePanelHeader`)

- Eyebrow: `"● NOW PLAYING"`.
- Title: film name or show name (for series).
- Meta: year · first genre segment · duration (movie) or Season N · genre ·
  episode duration (series).
- Plot paragraph (when present).
- **Series variant**: `sideEpisodeRow` below meta — green episode-code chip
  (same `episodeBadgeCode` styling) + episode title.

### Panel body (`.sideBody`)

**Movie variant**:
- `"UP NEXT"` eyebrow.
- Up to 3 films from `films` where `film.profile === currentFilm.profile &&
  film.id !== currentFilm.id`. Each `upNextRow`: poster thumb + title + genre;
  `<Link to="/player/{id}" replace>` play button.
- `"FROM YOUR WATCHLIST"` eyebrow.
- First 3 watchlist entries. Each `watchlistRow`: title + `"● ON DISK"` (green)
  or `"○ NOT ON DISK YET"` (muted). Link shown only if on disk.

**Series variant**:
- `"EPISODES"` eyebrow.
- `<SeasonsPanel seasons={film.seasons} activeEpisode={{seasonNumber,
  episodeNumber}} onSelectEpisode={selectEpisode} accordion={true} />`.
- No WATCHLIST section for series.

### Panel footer (`.footerRow`)

- `"OPEN IN VLC"` button + `"← BACK"` button (calls `onBack` →
  `goBackWithTransition`).

### EdgeHandle (right-edge handle)

- Reusable component; 28×84px lozenge (`position: absolute, right: 0`).
- Translucent white bg `rgba(255,255,255,0.10)`, beveled borders, full pill on
  left (`borderTopLeftRadius / borderBottomLeftRadius: 999px`), zero radius on
  right. `backdropFilter: blur(20px) saturate(180%)`, layered shadows.
- Contains `‹` chevron, white, 16px monospace.
- **Proximity behaviour** (computed from `cursorX, cursorY` each render):
  - `distFromEdge = max(0, innerWidth - cursorX)`.
  - `bulge = clamp(1 - distFromEdge / 140, 0, 1)`. Smoothstep-eased: `eased =
    bulge² · (3 − 2·bulge)`.
  - Inline `style.transform = translate((1 − eased)·64px, -50%) scale(1 +
    eased·0.18, 1 − eased·0.04)` — at `eased=0` tucked 64px past right edge;
    at `eased=1` flush, stretched 18% wider, squished 4% shorter.
  - Inline `style.top = clamp(cursorY, 62, innerHeight - 62)` — vertically
    follows cursor with viewport-edge clamping.
  - `opacity = eased`. `pointerEvents: eased > 0.08 ? "auto" : "none"`.
    `aria-hidden / tabIndex` flip with same threshold.
- Rendered when `!panelOpen && !chromeHidden`. Self-hides via opacity outside
  detection zone (140px).
- Click: `setPanelOpen(true)` + `e.stopPropagation()`.

### PanelScrim (click-outside dismiss)

- `position: absolute, inset: 0, zIndex: 18`, transparent. Rendered only when
  `panelOpen && !chromeHidden`. Click calls `setPanelOpen(false)` +
  `e.stopPropagation()`.

## Behaviour

### State machine — `state: PlayState`

- `idle` (initial) — overlay shown.
- `loading` — overlay shows spinner; `setTimeout(() => setState("playing"),
  600)` simulates decoder warm-up. **Production**: bind to MSE `canplay` event.
- `playing` — overlay hidden; chrome can auto-hide.

### Chrome auto-hide

- `chromeHidden: boolean`, default `false`.
- `INACTIVITY_MS = 3000`. `armInactivity()` schedules `setTimeout(() =>
  setChromeHidden(true), INACTIVITY_MS)`.
- Wake events on shell: `onMouseMove` → `handleMouseMove(e)` (calls
  `wakeChrome()` + updates `nearRightEdge` from `e.clientX`); `onClick`,
  `onKeyDown` → `wakeChrome()`.
- `wakeChrome()` clears `chromeHidden` and re-arms inactivity timer (only when
  `state === "playing"`).
- Effect: when `state !== "playing"`, clear timer + reveal chrome immediately.

### SidePanel toggle (drawer)

- `panelOpen: boolean`, default `false` (panel hidden on initial render).
- `cursor: { x: number, y: number }` — updated on `onMouseMove` from
  `e.clientX, e.clientY`. Initial value `{ x: innerWidth, y: innerHeight / 2 }`.
- `<EdgeHandle cursorX={cursor.x} cursorY={cursor.y} onActivate={() =>
  setPanelOpen(true)}>` rendered when `!panelOpen && !chromeHidden`. Component
  self-hides via opacity outside detection zone, so parent can mount
  unconditionally without flicker. Click calls `setPanelOpen(true)` +
  `e.stopPropagation()`.
- Panel close button (top-right `×`) calls `setPanelOpen(false)`.
- Transparent scrim (`panelScrim`) rendered when `panelOpen && !chromeHidden`,
  over VideoArea at `zIndex: 18`. Panel itself at `zIndex: 20`. Click scrim →
  `setPanelOpen(false)`.
- Panel visible state: `panelOpen && !chromeHidden` — when chrome auto-hides,
  panel slides off. `panelOpen` preserved, so panel reappears on wake.

### Navigation

- **Back**: `goBackWithTransition()` wraps `navigate(-1)` inside
  `document.startViewTransition(...)` when available, falls back to plain
  `navigate(-1)`. Both VideoArea topbar Back button and SidePanel Back button
  call this helper.
- **Forward entry**: Library's `playWithTransition` button handles entry-point
  transition.

### Series episode resolution

- URL contract: `/player/<filmId>?s=<season>&e=<episode>` (both optional,
  integers, 1-indexed).
- Missing or out-of-range params resolve via `resolveSeriesPick(film, s, e)` →
  first AVAILABLE episode (where `onDisk === true`). Falls back to first
  episode if none available, so UI loads deterministically even with empty
  library.
- When user clicks episode in side panel: `setSearchParams({ s, e }, { replace:
  true })`. URL change triggers loading state re-render, playback switches
  visually.
- **`selectEpisode` handler**: `(seasonNumber, episodeNumber) => {
  setSearchParams({ s: seasonNumber, e: episodeNumber }, { replace: true }); }`
  — `replace: true` keeps episode switches out of history (transient playback
  state, not navigation steps).

## View Transitions contract

**Both `Player.backdrop` and `Library.overlayPoster` MUST carry
`viewTransitionName: "film-backdrop"`** (the same value). If the two diverge,
the poster morph silently degrades to a plain cross-fade.

The shared name makes the View Transitions API treat the two poster elements
as the same logical element across routes, producing a smooth morph when
either direction of navigation is wrapped in `document.startViewTransition`.
Fallback on unsupported browsers (Safari < 18): plain `navigate(...)` — no
morph, no error.

## Subcomponents

Renders `<VideoArea>`, `<EdgeHandle>`, `<SidePanel>`, and optional `<PanelScrim>`.
These are Player-specific chrome, not reusable across routes.

- **`VideoArea`**: Backdrop + topbar + controls chrome.
- **`PlayerSidebar`**: Right-side drawer with episode picker (series) or UP NEXT
  + watchlist (movie).
- **`PlayerContent`**: Thin orchestrator managing chrome-hide state, panel
  open/close, cursor tracking, episode param resolution.

## Notes

- **Outstanding work**: Outstanding work tracked in
  [`Outstanding-Work.md`](../../release/Outstanding-Work.md#player).
- All controls (−10s, +10s, volume, fullscreen) wired to actual playback API
  (production implementation).
- Progress bar bound to actual playback time.
- "● PLAYING" / "○ PAUSED" status synchronized with actual playback state.
- On-disk dots in SidePanel reflect actual job/segment state (production).
- Loading state's 600ms simulation replaced by real MSE `canplay` event
  (production).
