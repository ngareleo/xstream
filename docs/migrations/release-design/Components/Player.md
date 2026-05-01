# Player (page)

> Status: **done** (Spec) · **not started** (Production)
> Spec updated: 2026-05-01 (PR #46 audit) — shell grid corrected to two Griffel classes (`shell` / `shellChromeHidden`); SidePanel UP NEXT source corrected (same-profile films, not watchlist); "FROM YOUR WATCHLIST" section documented; footer (VLC + BACK) documented. Prior update (73a9cca): `.backdrop` gains `viewTransitionName: "film-backdrop"`; back navigation wrapped in `goBackWithTransition` using `document.startViewTransition`; cross-cutting View Transitions contract noted.

## Files

- `design/Release/src/pages/Player/Player.tsx`
- `design/Release/src/pages/Player/Player.styles.ts`
- Prerelease behavioural reference: `design/Prerelease/src/pages/Player/`

## Purpose

Full-screen mock playback (`/player/:filmId`). **Bypasses [`AppShell`](AppShell.md)** — owns its own viewport, no header, no sidebar.

## Visual

### Outer wrapper (`.shell` / `.shellChromeHidden`)
- `width: 100vw`, `height: 100vh`, `backgroundColor: #000`, `position: relative`, `overflowX: hidden`, `overflowY: hidden`.
- 2-column grid via two Griffel classes:
  - `.shell`: `gridTemplateColumns: "1fr 290px"`, `transitionProperty: grid-template-columns`, `transitionDuration: 0.3s`, `transitionTimingFunction: ease`, `cursor: default`.
  - `.shellChromeHidden`: `gridTemplateColumns: "1fr 0px"`, `cursor: none`.
- Applied as `mergeClasses(styles.shell, chromeHidden && styles.shellChromeHidden)` — NOT inline style.

### Layout
- Left column: `<VideoArea>`. Right column: `<SidePanel>` (290px, hidden when chrome is hidden).

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
- Wake events on the wrapper: `onMouseMove`, `onClick`, `onKeyDown` → `wakeChrome()` clears timer + re-arms (only when `state === "playing"`).
- Effect: when `state !== "playing"`, clear timer + reveal chrome immediately.

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
  - `idle`: 80×80 green circle play button, `box-shadow: 0 0 60px var(--green-glow)`, `<IconPlay>` scaled 2×.
- **Topbar** (top, fades with chrome): `padding: 16px 26px`. Back button (`<IconBack> BACK`) on left + "● PLAYING" / "○ PAUSED" status eyebrow on right showing resolution + HDR/codec.
- **Bottom controls** (fade with chrome): `padding: 20px 26px 24px`.
  - Title in Anton 64px / `text-shadow: 0 4px 24px rgba(0,0,0,0.6)` / uppercase.
  - Eyebrow row: `{year} · {genre} · {duration}` in Mono 11 / 0.18em / uppercase / `rgba(255,255,255,0.7)`.
  - Progress bar row: timestamp `01:14:22` (mock) + 3px tall progress bar with `var(--green)` fill / `box-shadow: 0 0 12px var(--green-glow)`. Bar `background: rgba(255,255,255,0.18)`.
  - Control row (after progress): −10s / play-pause / +10s / volume / resolution chip / fullscreen button.

### `SidePanel`
- 290px wide, `background: var(--bg-1)`, `border-left: 1px solid var(--border)`.
- Fades + slides off when `chromeHidden` (`sidePanelHidden` class).
- **Header (`sidePanelHeader`)**: `"● NOW PLAYING"` eyebrow + title (`sideTitle`) + meta (`sideMeta`: year · first genre segment · duration) + plot paragraph (when present).
- **Body (`sideBody`)**:
  - `"UP NEXT"` eyebrow.
  - Up to 3 films from `films` where `film.profile === currentFilm.profile && film.id !== currentFilm.id`. Each `upNextRow`: poster thumb (`upNextPoster`) + title + genre; a `<Link to="/player/{id}" replace>` play button on the right.
  - `"FROM YOUR WATCHLIST"` eyebrow.
  - First 3 entries from `watchlist`. Each `watchlistRow`: title + `"● ON DISK"` (green) / `"○ NOT ON DISK YET"` (muted) based on whether a matching film exists in `films`. A `<Link to="/player/{filmId}" replace>` play link shown only if on disk.
- **Footer (`footerRow`)**: `"OPEN IN VLC"` button + `"← BACK"` button (calls `onBack` → `goBackWithTransition`).

## Changes from Prerelease

- **Shell grid expression:** OLD — `chromeHidden` toggled a dynamic inline `style={{ gridTemplateColumns: "1fr 290px" | "1fr 0px" }}`. NEW — two Griffel classes: `.shell` (`gridTemplateColumns: "1fr 290px"`) and `.shellChromeHidden` (`gridTemplateColumns: "1fr 0px"`), applied via `mergeClasses`. No visual difference; Griffel-idiomatic.
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
- [ ] 2-column grid: `.shell` = `1fr 290px`; `.shellChromeHidden` = `1fr 0px`; both use Griffel classes (not inline style); `transitionProperty: grid-template-columns`, `0.3s ease`
- [ ] State machine: `idle → loading → playing`, with 600ms loading-to-playing simulation **replaced by real `canplay`**
- [ ] Chrome auto-hide: 3000ms inactivity timer; wakes on mousemove / click / keydown; only armed while `playing`
- [ ] Cursor `none` when chromeHidden
- [ ] VideoArea background: Poster, brightness 0.85 contrast 1.05, grain overlay; `.backdrop` carries `viewTransitionName: "film-backdrop"` (must match Library `.overlayPoster`)
- [ ] Letterbox gradients: top 80px, bottom 220px, fade with chrome
- [ ] Idle overlay: 80×80 green circle play button with green-glow shadow
- [ ] Loading overlay: 56×56 circular spinner with green arc
- [ ] Topbar: Back button + status eyebrow showing resolution + HDR/codec
- [ ] Bottom title: Anton 64px with text-shadow
- [ ] Progress bar: 3px tall, green fill with green-glow shadow
- [ ] Control row: −10s / play-pause / +10s / volume / resolution chip / fullscreen
- [ ] SidePanel 290px: header (NOW PLAYING eyebrow + title + meta + plot) + body (UP NEXT from same-profile films, up to 3) + watchlist section (FROM YOUR WATCHLIST, first 3 watchlist entries with on-disk indicator) + footer (VLC + BACK)
- [ ] All controls wired to actual playback API
- [ ] Back: `goBackWithTransition()` shared helper on both VideoArea topbar and SidePanel back buttons — wraps `navigate(-1)` in `document.startViewTransition` with plain `navigate(-1)` fallback
- [ ] Unknown film ID fallback message

## Status

- [x] Designed in `design/Release` lab (baseline reflects current state). `.backdrop` gains `viewTransitionName: "film-backdrop"`; back navigation wrapped in `goBackWithTransition` at both callsites (VideoArea topbar + SidePanel); cross-cutting View Transitions contract documented (2026-05-01, PR #46 commit 73a9cca). Shell grid, SidePanel sections (UP NEXT + FROM YOUR WATCHLIST + footer) corrected to match source (2026-05-01, PR #46 audit). PR #46 on `feat/release-design-omdb-griffel`, not yet merged to main.
- [ ] Production implementation
