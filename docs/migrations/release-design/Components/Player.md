# Player (page)

> Status: **baseline** (Spec) · **not started** (Production)

## Files

- `design/Release/src/pages/Player/Player.tsx` (no `.styles.ts` — inline)
- Prerelease behavioural reference: `design/Prerelease/src/pages/Player/`

## Purpose

Full-screen mock playback (`/player/:filmId`). **Bypasses [`AppShell`](AppShell.md)** — owns its own viewport, no header, no sidebar.

## Visual

### Outer wrapper
- `width: 100vw`, `height: 100vh`, `background: #000`, `position: relative`, `overflow: hidden`.
- 2-column grid: `gridTemplateColumns: chromeHidden ? "1fr 0px" : "1fr 290px"`, `transition: grid-template-columns 0.3s ease`.
- `cursor: chromeHidden ? "none" : "default"`.

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
- `navigate(-1)` on Back (preserves origin pane state per Prerelease contract).
- `<Link to={\`/player/\${film.id}\`}>` is the only entry path (from FilmRow / DetailPane play buttons).

## Subcomponents

### `VideoArea`
- `position: relative`, `overflow: hidden`.
- **Background**: `<Poster>` filled `inset: 0, object-fit: cover`, `filter: brightness(0.85) contrast(1.05)`.
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
- **Header**: NOW PLAYING eyebrow + title.
- **UP NEXT list**: items from `watchlist`. Each item: poster thumb + title + on-disk status (green dot / muted dot toggle).
- Fades + slides off when `chromeHidden`.

## TODO(redesign)

- Inline styles only — migrate to Griffel + a `.styles.ts`.
- All controls (−10s, +10s, volume, fullscreen) are decorative — no handlers wired.
- Progress bar is hard-coded to `01:14:22` — needs to bind to actual playback time.
- "● PLAYING" / "○ PAUSED" status text vs the actual `<button>` toggling between play/pause icon — visual states are split; consolidate.
- The on-disk dots in SidePanel should reflect actual job/segment state, not just a mock toggle.
- Loading state's 600ms is a mock decoder warm-up; production binds to MSE `canplay` event.

## Porting checklist (`client/src/pages/Player/`)

- [ ] Bypass AppShell — full-viewport `100vw × 100vh` black background
- [ ] 2-column grid: `1fr ${chromeHidden ? 0 : 290}px`, with `transition: 0.3s ease`
- [ ] State machine: `idle → loading → playing`, with 600ms loading-to-playing simulation **replaced by real `canplay`**
- [ ] Chrome auto-hide: 3000ms inactivity timer; wakes on mousemove / click / keydown; only armed while `playing`
- [ ] Cursor `none` when chromeHidden
- [ ] VideoArea background: Poster, brightness 0.85 contrast 1.05, grain overlay
- [ ] Letterbox gradients: top 80px, bottom 220px, fade with chrome
- [ ] Idle overlay: 80×80 green circle play button with green-glow shadow
- [ ] Loading overlay: 56×56 circular spinner with green arc
- [ ] Topbar: Back button + status eyebrow showing resolution + HDR/codec
- [ ] Bottom title: Anton 64px with text-shadow
- [ ] Progress bar: 3px tall, green fill with green-glow shadow
- [ ] Control row: −10s / play-pause / +10s / volume / resolution chip / fullscreen
- [ ] SidePanel 290px: NOW PLAYING + UP NEXT (watchlist) with on-disk dots
- [ ] All controls wired to actual playback API
- [ ] Back navigates `navigate(-1)` (preserves origin pane state)
- [ ] Unknown film ID fallback message

## Status

- [ ] Designed in `design/Release` lab (baseline reflects current state)
- [ ] Production implementation
