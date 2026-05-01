# Player (page)

> Status: **done** (Spec) · **not started** (Production)
> Spec updated: 2026-05-02 (latest in day) — `IconPlay` rebuilt: path `M5 2 L14 8 L5 14 Z` (centroid at exact viewBox centre) **+** `stroke="currentColor"`, `strokeWidth="1.4"`, `strokeLinejoin="round"`, `strokeLinecap="round"` for rounded corners (Material Symbols `play_circle` reference). The stroke trick paints the same-colour outline around the filled polygon, expanding it outward with rounded joins — equivalent to a hand-bezier'd rounded triangle, but a single line of code. Optical centering is achieved by aligning the **centroid** at viewBox centre (not the bbox): a play triangle's visible mass lives at the centroid because the wide base on the left dominates perception, so bbox-centering would render the icon visibly left-of-centre. **Vertical centering bug** also fixed: the wrapping `<span>` (`bigPlayIcon`) was inline by default, so `align-items: center` on the parent flex was centering an inline line-box (with baseline leading) instead of the SVG itself — the icon sat ~4px above the disk centre. Fix: `display: flex; align-items: center; justify-content: center; line-height: 0` on `bigPlayIcon` + `display: block` on the SVG inside both `bigPlayIcon` and `playCta`. **Scale**: dropped the `transform: scale(2)` on `bigPlayIcon` in favour of an explicit `width/height: 40px` on the SVG (Griffel `& svg` rule) — the icon now occupies ~45% of the 88px disk, matching the Material reference's proportions. Affects every `<IconPlay>` consumer (rounded corners apply globally, which is desired). The big idle play button on Player and the Play CTA on Library's `FilmDetailsOverlay` also render their inner SVG with an **engraved** treatment: muted `color: rgba(255,255,255,0.55)` + paired drop-shadows (light below, dark above) producing a recessed-into-glass illusion. Earlier 2026-05-02 — `EdgeHandle` extracted into its own reusable component (`design/Release/src/components/EdgeHandle/`). Detection zone widened from 24px → 140px. Handle now bulges out of the right edge with a smoothstep-eased translation, scales asymmetrically (X stretch + Y squish) at peak proximity for a "wave" feel, and vertically follows `cursorY` (clamped). Earlier 2026-05-02 — SidePanel is now an **overlay**, not a grid column. Default state is closed; reveals via a right-edge handle button on mouse-proximity. Shell drops the `1fr 290px ↔ 1fr 0px` grid. New state `panelOpen`; new components `EdgeHandle` and panel close button. View Transitions contract preserved (backdrop is unchanged). Prior update 2026-05-01 (PR #46 audit) — shell grid corrected to two Griffel classes (`shell` / `shellChromeHidden`); SidePanel UP NEXT source corrected (same-profile films, not watchlist); "FROM YOUR WATCHLIST" section documented; footer (VLC + BACK) documented. Earlier (73a9cca): `.backdrop` gains `viewTransitionName: "film-backdrop"`; back navigation wrapped in `goBackWithTransition` using `document.startViewTransition`; cross-cutting View Transitions contract noted.

## Files

- `design/Release/src/pages/Player/Player.tsx`
- `design/Release/src/pages/Player/Player.styles.ts`
- `design/Release/src/components/EdgeHandle/EdgeHandle.tsx` (extracted right-edge handle component, used by Player)
- `design/Release/src/components/EdgeHandle/EdgeHandle.styles.ts`
- Prerelease behavioural reference: `design/Prerelease/src/pages/Player/`

## Purpose

Full-screen mock playback (`/player/:filmId`). **Bypasses [`AppShell`](AppShell.md)** — owns its own viewport, no header, no sidebar.

## Visual

### Outer wrapper (`.shell` / `.shellChromeHidden`)
- `width: 100vw`, `height: 100vh`, `backgroundColor: #000`, `position: relative`, `overflowX: hidden`, `overflowY: hidden`.
- **No grid** — VideoArea fills the viewport; SidePanel and EdgeHandle are absolutely-positioned siblings layered on top.
  - `.shell`: `cursor: default`.
  - `.shellChromeHidden`: `cursor: none`.
- Applied as `mergeClasses(styles.shell, chromeHidden && styles.shellChromeHidden)` — NOT inline style.

### Layout
- `<VideoArea>` fills the entire 100vw × 100vh shell.
- `<SidePanel>` is `position: absolute, right: 0, top: 0, bottom: 0, width: 290px, zIndex: 20` — overlays the right side of the video. Slides in via `transform: translateX(0)` ↔ `translateX(100%)` (300ms ease). Closed by default.
- `<EdgeHandle>` is `position: absolute, right: 0, top: 50%` — a 28×84px tab button that reveals when the mouse is within `EDGE_THRESHOLD_PX = 24` of the right edge AND the panel is closed AND chrome is shown. Click to open the panel.

### Unknown film fallback
- When `filmId` doesn't resolve: `<div style={{ padding: 32 }}><div className="eyebrow">UNKNOWN FILM ID — {filmId}</div></div>`.

## Behaviour

### State machine — `state: PlayState = "idle" | "loading" | "playing"`
- `idle` (initial) — overlay shown.
- `loading` — overlay shows spinner; `setTimeout(() => setState("playing"), 600)` simulates decoder warm-up.
- `playing` — overlay hidden; chrome can auto-hide.

### Chrome auto-hide
- `chromeHidden: boolean`, default `false`.
- `INACTIVITY_MS = 3000`. `armInactivity()` resets a `setTimeout(() => setChromeHidden(true), INACTIVITY_MS)`.
- Wake events on the wrapper: `onMouseMove` → `handleMouseMove(e)` (calls `wakeChrome()` + updates `nearRightEdge` from `e.clientX`); `onClick`, `onKeyDown` → `wakeChrome()`.
- `wakeChrome()` clears `chromeHidden` and re-arms the inactivity timer (only when `state === "playing"`).
- Effect: when `state !== "playing"`, clear timer + reveal chrome immediately.

### SidePanel toggle (drawer)
- `panelOpen: boolean`, default `false` (panel is hidden on initial render).
- `cursor: { x: number, y: number }` — updated on `onMouseMove` from `e.clientX, e.clientY`. Initial value `{ x: innerWidth, y: innerHeight / 2 }` (cursor parked at right-middle until first move).
- `<EdgeHandle cursorX={cursor.x} cursorY={cursor.y} onActivate={() => setPanelOpen(true)}>` rendered when `!panelOpen && !chromeHidden`. The component self-hides via `opacity: 0` + `pointerEvents: none` when the cursor is outside the detection zone, so the parent can mount it unconditionally without flicker. Clicking it calls `setPanelOpen(true)` and the click handler does `e.stopPropagation()` to keep `wakeChrome` from re-arming the inactivity timer mid-click.
- Panel close button (top-right, `×` glyph) calls `setPanelOpen(false)`.
- **Click-outside (drawer behaviour):** while `panelOpen && !chromeHidden`, a transparent scrim (`panelScrim`, `position: absolute; inset: 0; zIndex: 18`) is rendered over the VideoArea. Clicking the scrim calls `setPanelOpen(false)` + `e.stopPropagation()`. The panel itself sits at `zIndex: 20` and is unaffected by scrim clicks.
- The panel's visible state is `panelOpen && !chromeHidden` — when chrome auto-hides, the panel slides off too. `panelOpen` itself is preserved, so the panel reappears on the next wake event if the user had it open.

### Transitions
- `togglePlay()`:
  - From `idle` → `startPlay()` (sets `loading`, then 600ms later `playing`).
  - From `playing` → `setState("idle")` (manual pause).

### Navigation
- **Back:** `goBackWithTransition()` wraps `navigate(-1)` inside `document.startViewTransition(...)` when the API is available, falling back to `navigate(-1)` directly. Both the `VideoArea` topbar Back button and the `SidePanel` Back button call this helper (replaces the previous inline `() => navigate(-1)` lambdas at both callsites). Preserves origin pane state per Prerelease contract.
- **Forward entry:** `<Link to={\`/player/\${film.id}\`}>` is superseded by Library's `playWithTransition` button — navigating programmatically is required so the transition can wrap the route change. No Player-side change is needed for the entry path.

## View Transitions contract

**Both `Player.backdrop` and `Library.overlayPoster` MUST carry `viewTransitionName: "film-backdrop"`** (the same value). If the two values diverge, the poster morph silently degrades to a plain cross-fade.

The shared name makes the View Transitions API treat the two poster elements as the same logical element across routes, producing a smooth morph when either direction of navigation is wrapped in `document.startViewTransition`. Fallback on unsupported browsers (Safari < 18): plain `navigate(...)` — no morph, no error.

## Subcomponents

### `EdgeHandle` (right-edge handle, extracted component)

Lives at `design/Release/src/components/EdgeHandle/`. Reusable; props: `cursorX, cursorY, onActivate`. Exports `EDGE_DETECTION_ZONE_PX` (currently `140`).

**Visual base** (Liquid Glass lozenge):
- `position: absolute, right: 0`. Width 30px, height 108px.
- Translucent white bg `rgba(255,255,255,0.10)`, beveled-light borders (top brighter than bottom), `borderTopLeftRadius / borderBottomLeftRadius: 999px` (full pill on the left side), zero radius on the right (anchored to the viewport edge).
- `backdropFilter: blur(20px) saturate(180%)`, layered shadows (inset highlight + dark inner edge + ambient `-8px 0 28px rgba(0,0,0,0.45)`).
- Contains a single `‹` chevron, white, 16px monospace. `aria-label="Open side panel"`.
- `transformOrigin: right center`, `zIndex: 15`. `:hover` brightens bg + amplifies shadow + adds a faint white halo.

**Proximity behaviour** (computed from `cursorX, cursorY` on every render):
- `distFromEdge = max(0, innerWidth - cursorX)`.
- `bulge = clamp(1 - distFromEdge / 140, 0, 1)`. Smoothstep-eased: `eased = bulge² · (3 − 2·bulge)` for an S-curve that accelerates as the cursor closes in (the "wave" feel).
- Inline `style.transform = translate((1 − eased)·64px, -50%) scale(1 + eased·0.18, 1 − eased·0.04)` — at `eased=0` the lozenge is tucked 64px past the right edge; at `eased=1` it's flush, stretched 18% wider, and squished 4% shorter (vertical pinch + horizontal bulge = wave aesthetic).
- Inline `style.top = clamp(cursorY, 62, innerHeight - 62)` — vertically follows the cursor with viewport-edge clamping (54px half-height + 8px breathing room).
- Inline `style.opacity = eased`. `pointerEvents: eased > 0.08 ? "auto" : "none"`. `aria-hidden / tabIndex` flip with the same threshold so the handle is keyboard-/AT-inert when it's not visible.

**Render gating:** the parent (Player) mounts `<EdgeHandle>` whenever `!panelOpen && !chromeHidden`. The handle self-hides via opacity when the cursor is far away, so the parent doesn't need a separate "near edge" boolean.

### `VideoArea`
- `position: relative`, `overflow: hidden`.
- **Background**: `<Poster>` filled `inset: 0, object-fit: cover`, `filter: brightness(0.85) contrast(1.05)`. The `.backdrop` Griffel class carries **`viewTransitionName: "film-backdrop"`** — must stay in sync with Library's `.overlayPoster` (see [View Transitions contract](#view-transitions-contract-1) below).
- **Grain layer**: `.grain-layer` utility, `opacity: 0.18`, `mix-blend-mode: overlay`.
- **Letterbox gradients** (fade out with `chromeHidden`):
  - Top: 80px tall, `linear-gradient(180deg, rgba(0,0,0,0.85), transparent)`.
  - Bottom: 220px tall, `linear-gradient(0deg, rgba(0,0,0,0.92), transparent)`.
- **Idle/loading overlay** (when `state !== "playing"`):
  - Full-area `<button onClick={onPlay}>`, `background: rgba(0,0,0,0.35)`.
  - `loading`: 56×56 circular spinner with green top arc, 0.9s linear spin.
  - `idle`: **glass play button** — 88×88 circle, `backgroundColor: rgba(255,255,255,0.12)`, `backdropFilter: blur(20px) saturate(180%)`, white-translucent borders (top brighter than bottom for a beveled-light feel), `boxShadow: inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.25), 0 12px 40px rgba(0,0,0,0.5)`. `<IconPlay>` rendered at 40×40px (`& svg` rule, no `scale()`) with **engraved** treatment: `color: rgba(255,255,255,0.55)` + `filter: drop-shadow(0 1px 0.5px rgba(255,255,255,0.45)) drop-shadow(0 -1px 0.5px rgba(0,0,0,0.55))` (paired light-below / dark-above shadows produce a recessed-into-glass illusion). The wrapping `bigPlayIcon` span is `display: flex; align-items: center; justify-content: center; line-height: 0` so the SVG centres on its own box, not on a baseline-laden line-box. iOS-26 "Liquid Glass" inspired.
- **Topbar** (top, fades with chrome): `padding: 16px 26px`. **Icon-only Back button** on left (`<IconBack>` only — no "BACK" text label, no border, transparent bg). At rest: `color: rgba(255,255,255,0.85)` + `filter: drop-shadow(0 2px 6px rgba(0,0,0,0.6))` for legibility. On `:hover`: `color: #fff` + extra `drop-shadow(0 0 12px rgba(255,255,255,0.65))` glow. `:active` scales to 0.94. Right side: "● PLAYING" / "○ PAUSED" status eyebrow showing resolution + HDR/codec.
- **Bottom controls** (fade with chrome): `padding: 20px 26px 24px`.
  - Title in Anton 64px / `text-shadow: 0 4px 24px rgba(0,0,0,0.6)` / uppercase.
  - Eyebrow row: `{year} · {genre} · {duration}` in Mono 11 / 0.18em / uppercase / `rgba(255,255,255,0.7)`.
  - Progress bar row: timestamp `01:14:22` (mock) + 3px tall progress bar with `var(--green)` fill / `box-shadow: 0 0 12px var(--green-glow)`. Bar `background: rgba(255,255,255,0.18)`.
  - Control row (after progress): −10s / play-pause / +10s / volume / resolution chip / fullscreen button.

### `SidePanel`
- 290px wide, `background: var(--bg-1)`, `border-left: 1px solid var(--border)`.
- Overlays the video: `position: absolute, top: 0, right: 0, bottom: 0, zIndex: 20`, `boxShadow: -12px 0 32px rgba(0,0,0,0.45)` for separation from the video below.
- Open/close via `transform: translateX(0)` ↔ `translateX(100%)` + `opacity` 1↔0, both transitioning at 0.3s ease (`sidePanelHidden` class). `aria-hidden={!open}`.
- Top-right `×` close button (`panelCloseBtn`, `position: absolute, top: 12px, right: 12px`, 26×26 circle) calls `onClose`.
- **Header (`sidePanelHeader`)**: `"● NOW PLAYING"` eyebrow + title (`sideTitle`) + meta (`sideMeta`: year · first genre segment · duration) + plot paragraph (when present).
- **Body (`sideBody`)**:
  - `"UP NEXT"` eyebrow.
  - Up to 3 films from `films` where `film.profile === currentFilm.profile && film.id !== currentFilm.id`. Each `upNextRow`: poster thumb (`upNextPoster`) + title + genre; a `<Link to="/player/{id}" replace>` play button on the right.
  - `"FROM YOUR WATCHLIST"` eyebrow.
  - First 3 entries from `watchlist`. Each `watchlistRow`: title + `"● ON DISK"` (green) / `"○ NOT ON DISK YET"` (muted) based on whether a matching film exists in `films`. A `<Link to="/player/{filmId}" replace>` play link shown only if on disk.
- **Footer (`footerRow`)**: `"OPEN IN VLC"` button + `"← BACK"` button (calls `onBack` → `goBackWithTransition`).

## Changes from Prerelease

- **Shell layout:** OLD (Prerelease) — `chromeHidden` toggled a dynamic inline `style={{ gridTemplateColumns: "1fr 290px" | "1fr 0px" }}`; opening/closing the side panel resized the video. NEW — shell is no longer a grid; VideoArea is `position: absolute; inset: 0` filling the shell, and SidePanel/EdgeHandle/panelScrim are absolutely-positioned siblings layered on top. Opening the panel **does not shift the video.**
- **SidePanel default + entry point:** OLD — visible by default; only hidden when `chromeHidden`. NEW — hidden by default (`panelOpen = false`); the user opens it explicitly via the right-edge `EdgeHandle` button. EdgeHandle reveals on mouse-proximity to the right edge (24px threshold).
- **SidePanel close affordances (drawer pattern):** OLD — only the chrome auto-hide could dismiss the panel. NEW — three ways to close: (a) top-right `×` button (`panelCloseBtn`), (b) clicking outside the panel (transparent `panelScrim` at `zIndex: 18` over VideoArea), (c) chrome auto-hide (panel slides off, `panelOpen` preserved).
- **Topbar Back button:** OLD — chip-style `<IconBack> BACK` button with translucent black bg + 1px white-translucent border + mono "BACK" label. NEW — icon-only, no border, no bg, `color: rgba(255,255,255,0.85)` + drop-shadow for legibility against the poster. Hover: `color: #fff` + white drop-shadow glow.
- **Idle play button (`bigPlay`):** OLD — 80×80 solid green circle with `0 0 60px green-glow` halo (Release identity). NEW — 88×88 **glass** circle: translucent white bg, `backdropFilter: blur(20px) saturate(180%)`, beveled-light borders, layered inset highlights + drop shadow. iOS-26 Liquid Glass inspired. The Player's identity is now glassy/neutral rather than green-as-identity-marker (green still appears on the progress bar fill and SidePanel "● NOW PLAYING" eyebrow).
- **SidePanel hide animation:** OLD — opacity fade only. NEW — `transform: translateX(100%)` + opacity, both 0.3s ease. Slides off the right.
- **Cursor when hidden:** OLD — `cursor: "none"` via inline style. NEW — `cursor: none` in the `.shellChromeHidden` Griffel class.
- **Back navigation:** OLD — both VideoArea topbar Back button and SidePanel footer Back button used inline lambdas `() => navigate(-1)`. NEW — both callsites share `goBackWithTransition()` helper: `document.startViewTransition(() => navigate(-1))` when the API is available, else plain `navigate(-1)`.
- **View transitions:** OLD — no view transitions. NEW — `.backdrop` (the `<Poster>` background in `VideoArea`) carries `viewTransitionName: "film-backdrop"`, which must stay in sync with `Library.overlayPoster`. The forward-entry path (Library → Player) uses `playWithTransition` in `Library`; no Player-side change required for the entry.
- **SidePanel "UP NEXT" source:** OLD — (was ambiguous in prior spec). NEW — confirmed: up to 3 films from `films` where `film.profile === currentFilm.profile && film.id !== currentFilm.id`.
- **SidePanel "FROM YOUR WATCHLIST":** OLD — the watchlist section in the SidePanel existed in Prerelease (first 3 watchlist entries shown). NEW — confirmed identical; spec section explicitly named "FROM YOUR WATCHLIST" with on-disk indicator dot.
- **Footer:** OLD — VLC button + Back button in `footerRow`. NEW — identical; both buttons present. Back button calls `onBack` → `goBackWithTransition()`.
- **Identity:** The Player page itself carries the Release visual identity (green progress bar fill, green-glow box-shadow on idle button) vs. Prerelease red. No structural difference — colour tokens changed.

## TODO(redesign)

- All controls (−10s, +10s, volume, fullscreen) are decorative — no handlers wired.
- Progress bar is hard-coded to `01:14:22` — needs to bind to actual playback time.
- "● PLAYING" / "○ PAUSED" status text vs the actual `<button>` toggling between play/pause icon — visual states are split; consolidate.
- The on-disk dots in SidePanel should reflect actual job/segment state, not just a mock toggle.
- Loading state's 600ms is a mock decoder warm-up; production binds to MSE `canplay` event.

## Porting checklist (`client/src/pages/Player/`)

- [ ] Bypass AppShell — full-viewport `100vw × 100vh` black background
- [ ] Shell is **not a grid**: VideoArea fills the viewport; SidePanel and EdgeHandle are absolutely-positioned siblings. `.shell` / `.shellChromeHidden` only toggle cursor.
- [ ] State machine: `idle → loading → playing`, with 600ms loading-to-playing simulation **replaced by real `canplay`**
- [ ] Chrome auto-hide: 3000ms inactivity timer; wakes on mousemove / click / keydown; only armed while `playing`
- [ ] Track `cursor: {x, y}` on `onMouseMove` (`clientX, clientY`)
- [ ] `<EdgeHandle cursorX cursorY onActivate>` rendered as own component while `!panelOpen && !chromeHidden`. Detection zone 140px. Self-hides via opacity outside the zone. Smoothstep-eased bulge: translateX out → flush, asymmetric scale (X stretch 18%, Y squish 4%), top clamped to cursor Y. Click → `setPanelOpen(true)` + `stopPropagation()`
- [ ] `panelScrim` (transparent, `position: absolute; inset: 0; zIndex: 18`) renders only when `panelOpen && !chromeHidden`; click closes the panel (drawer pattern)
- [ ] Cursor `none` when chromeHidden
- [ ] VideoArea background: Poster, brightness 0.85 contrast 1.05, grain overlay; `.backdrop` carries `viewTransitionName: "film-backdrop"` (must match Library `.overlayPoster`)
- [ ] Letterbox gradients: top 80px, bottom 220px, fade with chrome
- [ ] Idle overlay: 80×80 green circle play button with green-glow shadow
- [ ] Loading overlay: 56×56 circular spinner with green arc
- [ ] Topbar: **icon-only** Back button (no "BACK" label) with drop-shadow + hover white-glow + status eyebrow showing resolution + HDR/codec
- [ ] Idle play button: **glass** 88×88 circle (translucent white bg, `backdropFilter: blur(20px) saturate(180%)`, beveled borders, inset highlights + drop shadow) — NOT solid green
- [ ] Bottom title: Anton 64px with text-shadow
- [ ] Progress bar: 3px tall, green fill with green-glow shadow
- [ ] Control row: −10s / play-pause / +10s / volume / resolution chip / fullscreen
- [ ] SidePanel 290px overlay: `position: absolute, right: 0, top: 0, bottom: 0, zIndex: 20`; slide via `transform: translateX(100%)` ↔ `0`, 0.3s ease. Default closed.
- [ ] SidePanel content: header (NOW PLAYING eyebrow + title + meta + plot) + body (UP NEXT from same-profile films, up to 3) + watchlist section (FROM YOUR WATCHLIST, first 3 watchlist entries with on-disk indicator) + footer (VLC + BACK)
- [ ] SidePanel top-right `×` close button → `setPanelOpen(false)`
- [ ] Visible state of SidePanel = `panelOpen && !chromeHidden` — chrome auto-hide slides the panel off but preserves `panelOpen`
- [ ] All controls wired to actual playback API
- [ ] Back: `goBackWithTransition()` shared helper on both VideoArea topbar and SidePanel back buttons — wraps `navigate(-1)` in `document.startViewTransition` with plain `navigate(-1)` fallback
- [ ] Unknown film ID fallback message

## Status

- [x] Designed in `design/Release` lab (baseline reflects current state). 2026-05-02 (later): `EdgeHandle` extracted into its own component (`design/Release/src/components/EdgeHandle/`). Detection zone widened 24px → 140px. Bulge animation: smoothstep ease, X stretch + Y squish at peak proximity, vertical position follows cursor Y. Earlier 2026-05-02: SidePanel converted from grid column to overlay; default state hidden; reveals via right-edge handle (then a 24px-edge tab); explicit top-right close button; slide animation via `transform: translateX`. Shell grid removed. View Transitions contract preserved (backdrop unchanged). 2026-05-01: `.backdrop` gains `viewTransitionName: "film-backdrop"`; back navigation wrapped in `goBackWithTransition` at both callsites (VideoArea topbar + SidePanel); cross-cutting View Transitions contract documented (PR #46 commit 73a9cca). 2026-05-01: Shell grid, SidePanel sections (UP NEXT + FROM YOUR WATCHLIST + footer) corrected to match source (PR #46 audit).
- [ ] Production implementation
