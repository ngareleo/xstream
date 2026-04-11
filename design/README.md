# Moran — UI Design Lab

A pixel-faithful React prototype of the Moran streaming client. Built to validate
every interaction pattern before implementing against the real GraphQL/MSE data layer.

Run with:
```bash
cd design && bun dev   # http://localhost:5173
```

---

## Design system tokens

All values live in `src/styles/shared.css` as CSS custom properties.

| Token | Value | Usage |
|---|---|---|
| `--red` | `#CE1126` | Primary accent, badges, play buttons |
| `--black` | `#080808` | App background |
| `--surface` | `#0F0F0F` | Panel / sidebar backgrounds |
| `--surface2` | `#161616` | Cards, inputs |
| `--border` | `#222222` | Dividers |
| `--muted` | `#666666` | Secondary text |
| `--green` | `#27AE60` | "On disk" indicators |
| `--yellow` | `#F5C518` | IMDb ratings, warnings |
| `--font-head` | Bebas Neue | Film titles, hero greeting |
| `--font-body` | Inter | All UI text |

---

## Application shell

```
┌─────────────────────────────────────┐
│  header  (52px, full width)         │
├──────────┬──────────────────────────┤
│ sidebar  │  main                    │
│ (220px)  │  (1fr)                   │
│          │                          │
└──────────┴──────────────────────────┘
```

- The shell is a CSS grid: `grid-template-areas: "header header" "sidebar main"`.
- Sidebar collapses to 52px when the user clicks the Collapse button
  (`nav-collapsed` class on `.app-shell`, all labels hide, only icons remain).
- The Player page bypasses the shell entirely — it is a full-viewport grid.
- The header brand area (`header-brand`) has a matching width transition so
  it stays aligned with the sidebar as it collapses.

---

## Pages

### 1 — Profiles (`/`)

The home screen. Shows all media library directories and their contents.

**Layout:**
```
main
└── split-body (grid: 1fr | 0px → 360px)
    ├── split-left (flex column)
    │   ├── dashboard-hero   (220px, slideshow + greeting overlay)
    │   ├── location-bar     (38px breadcrumb)
    │   ├── dir-header       (column labels)
    │   ├── dir-list         (flex:1, scrollable profile tree)
    │   └── dir-footer       (aggregate stats)
    └── right-pane           (full height of split-body)
```

**Hero:**
- Slideshow cycles through images every 5 seconds with a crossfade.
- The greeting overlay sits at absolute position over the left ~380px, fading
  to transparent at 100% so the photo shows cleanly on the right side.
- The greeting is time-aware: "Good morning / afternoon / evening".

**Directory tree:**
- Each `ProfileRow` contains a collapsible list of `FilmRow` children.
- Clicking a row expands it and sets it as "selected" (visual highlight).
- The match-rate bar turns yellow when `unmatched > 0`.
- A scanning profile shows a live spinner + `done/total` count instead of the
  match bar; action buttons are replaced with "Scanning…" text.

**Right pane — film detail (`?pane=film-detail&filmId=xxx`):**
- 200px poster area (gradient placeholder → real poster in production).
- Technical badges: resolution, HDR format, codec, audio, channels.
- IMDb rating + duration strip.
- Synopsis (full text).
- Cast chips.
- File metadata table: filename, container, size, bitrate, frame rate.
- PLAY button navigates to `/player/:id` via React Router `<Link>` (not `<a href>`).
- RE-LINK button opens the metadata-linking flow (not prototyped).
- Close (×) button removes `pane` and `filmId` from search params.

**Right pane — new profile (`?pane=new-profile`):**
- Form with: Profile Name, Directory Path + Browse button, Media Type select,
  File Extensions chip toggles.
- "Create & Scan" is the primary action; Cancel closes the pane.

**UX details:**
- Pane state is URL-encoded. Opening a detail pane pushes a history entry.
  Back button restores the previous pane state (or closes it if there was none).
- Clicking a film row that is already showing in the pane **closes** it (toggle/deselect).
- When the pane opens, `split-body` transitions `grid-template-columns` from
  `1fr 0px` → `1fr 360px` (CSS transition, no JS).
- The hero and location bar are inside `split-left` (not above `split-body`),
  so the right pane spans the full height of the main area.
- Column headers switch to a condensed set when the pane is open (CSS-only via
  `.split-body.pane-open .dir-header`).

---

### 2 — Library (`/library`)

Poster grid view of every film across all profiles.

**Layout:**
```
main
└── split-body (grid: 1fr | 0px → 360px)
    ├── split-left
    │   ├── filter-bar   (search input + type filter + view toggle)
    │   └── profile-section × N
    │       ├── profile-section-head
    │       └── films-grid (poster cards)
    └── right-pane (DetailPane, same structure as Profiles page)
```

**Filter bar:**
- Search input filters by title, filename, and genre (client-side, case-insensitive).
- Type filter select (All / Movies / TV Shows) — visual only in the design lab.
- Grid / List view toggle — list view UI exists but content not yet implemented.

**Poster card:**
- Fixed-aspect-ratio card with gradient placeholder background.
- 4K badge (top-right, red) when `resolution === "4K"`.
- IMDb rating (bottom-right, yellow) when available.
- Question-mark icon centered when the file is unmatched.
- Selected state adds a red border and slightly raised appearance.

**Right pane:**
- Identical structure to the Profiles detail pane.
- URL pattern: `/library?film=xxx`.
- Toggle behaviour: clicking the same card again closes the pane.

---

### 3 — Player (`/player/:filmId`)

Full-screen playback. Bypasses the app shell (no sidebar, no header).

**Layout:**
```
player-root (grid: 1fr | 290px)
├── video-area (position: relative)
│   ├── video          (z-index: 1, object-fit: cover)
│   ├── .scene         (z-index: 0, atmospheric gradient background)
│   ├── .grain         (z-index: 2, SVG noise overlay, opacity 0.35)
│   ├── .letterbox     (z-index: 3, top+bottom fade)
│   ├── .pre-overlay   (z-index: 5, idle/loading overlay)
│   ├── .player-topbar (z-index: 10, position: absolute top)
│   └── .player-controls (z-index: 10, position: absolute bottom)
└── .side-panel
    ├── .panel-head   (Now Playing: title, meta, plot)
    ├── .panel-body   (Up Next + From Your Watchlist)
    └── .panel-foot   (Open in VLC, Back)
```

#### Player state machine

```
      ┌──────────────────────────────────────────┐
      │                  idle                    │
      │  Pre-play overlay visible.               │
      │  Poster gradient + centered play button. │
      │  Inactivity timer SUPPRESSED.            │
      └──────────────┬───────────────────────────┘
                     │ user clicks play (overlay or control bar)
                     ▼
      ┌──────────────────────────────────────────┐
      │                loading                   │
      │  video.play() called.                    │
      │  Spinner replaces the play button.       │
      │  Overlay still visible, not clickable.   │
      └──────────────┬───────────────────────────┘
                     │ HTMLVideoElement fires "playing"
                     ▼
      ┌──────────────────────────────────────────┐
      │                playing                   │
      │  Overlay removed. Video fills frame.     │
      │  Inactivity timer ACTIVE (3 000 ms).     │
      │  On "waiting": regresses back to loading.│
      │  On "ended":   returns to idle.          │
      └──────────────────────────────────────────┘
```

#### Inactivity hide

After 3 000 ms of no mouse/keyboard/click activity:
1. `controls-hidden` class added to `.player-root`.
2. `.player-topbar`, `.player-controls`, `.side-panel` → `opacity: 0; pointer-events: none`.
3. Grid collapses: `grid-template-columns: 1fr 0px` (smooth CSS transition).
4. Cursor hidden.

Any mouse move / key / click restores everything immediately and resets the timer.
The timer is **never** started while `playerState === "idle"` so the idle screen
never self-hides.

#### Controls behaviour
- **Progress bar**: click anywhere to seek. Two layers: buffered (dim) + played (red).
  Thumb appears on hover (CSS only).
- **Skip buttons**: ±10 seconds on `currentTime`.
- **Volume**: horizontal scrub track, 0–1, reflected back to `video.volume`.
- **Resolution select**: visual state only. In production, changing resolution
  triggers `stopStream()` → `startStream(newResolution)` on the MSE pipeline.
- **Fullscreen**: `requestFullscreen()` on `.player-root` (includes side panel).
- **Back** (topbar + footer): `navigate(-1)` — uses browser history, never hardcodes a path.

#### Side panel
- **Up Next**: up to 4 matched films from the same library, excluding the current one.
  Navigating to one replaces the current history entry.
- **Watchlist**: first 4 items. "On disk" (green) vs "Not on disk yet" (muted) based
  on whether the film exists in the local library. Only on-disk items have a play button.
- **Open in VLC**: passes the absolute file path to the `vlc://` URL scheme.

---

## URL routing scheme

| URL | Page | Pane state |
|---|---|---|
| `/` | Profiles | closed |
| `/?pane=new-profile` | Profiles | New Profile form |
| `/?pane=film-detail&filmId=dune-2` | Profiles | Film detail for dune-2 |
| `/library` | Library | closed |
| `/library?film=dune-2` | Library | Film detail for dune-2 |
| `/player/dune-2` | Player | — |
| `/watchlist` | Watchlist | — |
| `/settings` | Settings | — |

Pane state is always in the URL. This means:
- Opening a pane pushes a history entry → Back closes it.
- Deep-linking to a URL with a pane param opens the pane immediately.
- Navigating to the player and back restores the exact pane state.

---

## Component map (mock → production)

| Design component | Production equivalent |
|---|---|
| `data/mock.ts` · `profiles` | `ProfilesPageContent` · `useLazyLoadQuery` |
| `data/mock.ts` · `films` | Fragment spreads on `LibraryContent` |
| `data/mock.ts` · `user` | `viewer` field on root query |
| `data/mock.ts` · `watchlist` | `watchlist` query + `watchlistItemAdded` subscription |
| `FilmDetailPane` / `DetailPane` | `VideoDetailsPanel` + `VideoDetailsPanelAsync` |
| `NewProfilePane` | `SetupPageContent` library form |
| `<video src="test.mp4">` | `VideoPlayer` (MSE via `useVideoPlayback`) |
| `resolution` select | `ControlBar` resolution badge + switch |
| Slideshow images | Real poster/backdrop images from TMDB |
| `film.gradient` | Extracted dominant colour from poster |

---

## Key invariants for implementation

1. **Pane state in URL, not component state.** Use `useSearchParams` for anything
   that should survive navigation. Local `useState` is only for transient UI
   (expand/collapse rows, search input, view-mode toggle).

2. **All navigation uses `<Link>` or `navigate()`.** Never `<a href>` for in-app
   links — it bypasses the history stack and breaks Back.

3. **Inactivity hide is suppressed when idle.** Do not start the auto-hide timer
   until `playerState === "playing"`. Otherwise the play button fades out before
   the user has clicked it.

4. **`playing` event (not `play`) transitions loading → playing.** The `play` event
   fires when `video.play()` is called, before any frames are rendered. `playing`
   fires when frames are actually being decoded. The spinner should stay visible
   until `playing`.

5. **Second-click closes the pane.** On both the Profiles and Library pages,
   clicking an already-selected item must close the detail pane (toggle deselect).

6. **`<Link>` for play buttons, `navigate(-1)` for back buttons.** Never
   hardcode a return path — the Player must go back to wherever it came from.
