# Moran — UI Design Lab (Prerelease)

A pixel-faithful React prototype of the **Moran** streaming client (the
prerelease look — red `#CE1126` accent, Bebas Neue display). Frozen as a
historical reference. The active design lab is now `design/Release/`
(Xstream identity).

Run with:
```bash
cd design/Prerelease && bun dev   # http://localhost:5000
```

Or boot both labs together from the repo root:
```bash
bun run design                    # Prerelease :5000 · Release :5001
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
- The Player and Goodbye pages bypass the shell entirely.
- The header brand area (`header-brand`) has a matching width transition so
  it stays aligned with the sidebar as it collapses.

### Profile menu

The user row at the bottom of the sidebar is a clickable button that opens a
popover menu positioned above it (or to the right when the sidebar is collapsed).

Menu contents:
- **User info header** — avatar, display name, email.
- **Profiles** section — one button per profile with item count. Clicking
  navigates to `/`.
- **Go to home** — navigates to `/`.
- **Account settings** — navigates to `/settings?section=account`.
- **Sign out** — closes the menu and opens the sign-out confirmation dialog.

The menu closes on outside click or Escape. The chevron on the user row rotates
90° when the menu is open.

### Sign-out confirmation dialog

A modal overlay with blurred backdrop. Confirms the user wants to sign out
before navigating to `/goodbye`. Two actions: **Cancel** and **Sign out**.
Clicking the overlay backdrop cancels.

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
  `1fr 0px 0px` → `1fr 4px 360px`. The middle column is the resize handle.
- The hero and location bar are inside `split-left` (not above `split-body`),
  so the right pane spans the full height of the main area.
- Column headers switch to a condensed set when the pane is open (CSS-only via
  `.split-body.pane-open .dir-header`).
- The right pane is **drag-resizable** via the `useSplitResize` hook (see below).

---

### 2 — Library (`/library`)

Poster grid or compact list view of every film across all profiles. Films are
presented in a single flat list — **not partitioned by profile**.

**Layout:**
```
main
└── split-body (grid: 1fr | 0px → 360px)
    ├── split-left
    │   ├── filter-bar      (search + type filter + view toggle)
    │   ├── profile-chips   (All profiles | per-profile pill filters)
    │   └── films-grid / films-list
    └── right-pane (DetailPane, same structure as Profiles page)
```

**Filter bar:**
- Search input filters by title, filename, and genre (client-side, case-insensitive).
- Type filter select (All / Movies / TV Shows).
- Grid / List view toggle.

**Profile chips:**
- Pill buttons below the filter bar: "All profiles" + one chip per library.
- Clicking a chip filters to that library; clicking the active chip returns to All.
- Each chip shows a film count. Chips are mutually exclusive.

**Grid view — Poster card:**
- Fixed-aspect-ratio card with gradient placeholder background.
- 4K badge (top-right, red) when `resolution === "4K"`.
- IMDb rating (bottom-right, yellow) when available.
- Question-mark icon centered when the file is unmatched.
- Selected state adds a red border and slightly raised appearance.

**List view — Film row:**
- 48×68px gradient thumbnail.
- Title + year · genre + profile pill (which library it belongs to).
- Format badges: resolution (red for 4K, gray otherwise) + HDR format.
- Rating (yellow), Duration, Size — right-aligned columns with column headers.
- Selected row highlighted with a red tint.

**Right pane:**
- Identical structure to the Profiles detail pane.
- URL pattern: `/library?film=xxx`.
- Toggle behaviour: clicking the same card/row again closes the pane.

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

### 4 — Settings (`/settings`)

A two-column layout: a nav sidebar on the left (6 sections) and a content
panel on the right.

**URL-based section deep-linking:** the `?section=<id>` search param sets the
active section on mount. Any valid section ID (`general`, `library`, `playback`,
`metadata`, `account`, `danger`) is accepted; invalid or absent values fall back
to `"general"`. This lets the profile menu's "Account settings" item link
directly to `/settings?section=account`.

Sections: General, Library, Playback, Metadata, Account, Danger Zone.

The Danger Zone section uses red accent colours and destructive-action button
styling. All inputs and toggles are visual-only in the design lab.

---

## Loading bar

Pages signal loading state via `usePageLoading(loading)`. A single `<LoadingBar>`
component rendered in `AppShell` (via `LoadingBarProvider`) reacts to any active
loader and runs a three-phase animation:

```
loading  →  completing  →  idle
(fake progress 0→88%)   (snap to 100%, fade out)
```

The bar is a 3px fixed strip at the top of the viewport (z-index 9990), below the
52px header. Animation uses CSS `transform: scaleX()` with `transform-origin: left`
to avoid layout reflow.

**Phase details:**
- `loading` — `lb-grow` keyframe eases from `scaleX(0)` to `scaleX(0.88)` over
  8s with a deceleration curve. A subtle sheen sweep and a pulsing spark at the
  leading edge add depth.
- `completing` — `lb-complete` keyframe snaps to `scaleX(1)` then fades out
  over 600ms. Triggered when `isLoading` transitions false → true.
- `idle` — bar is hidden (`display: none`).

**Multi-loader counting** — `LoadingBarProvider` tracks a `Map<id, boolean>` so
multiple pages can signal loading simultaneously without cancelling each other
(e.g. during a tab switch before the previous page unmounts).

Pages call `usePageLoading(loading)` at the top level. The hook registers/
deregisters itself via `useEffect` and `useId`, requiring no manual cleanup.

---

### 5 — Goodbye (`/goodbye`)

Full-screen farewell page shown after the user confirms sign-out from the
profile menu.

Atmospheric treatment matching the Player idle overlay and the 404 page (grain
texture + radial glow + Bebas Neue ghost watermark). No app-shell (no sidebar
or header).

- Ghost "GOODBYE" watermark at 3% opacity.
- "SEE YOU NEXT TIME, \<name\>." in Bebas Neue.
- Subtitle: "Your library will be right here when you get back."
- "Back to home" button + countdown label.
- Auto-redirects to `/` after 4 seconds via a `useEffect` countdown.

---

### 6 — NotFound (`*`)

A catch-all route rendered inside AppShell for any unknown URL.

Atmospheric treatment (grain texture + radial red-black gradient) matches the
Player idle overlay so the error state feels native to the design language.

- Large "404" in Bebas Neue at 18% opacity — a ghost mark, not a screaming banner.
- "Page not found" title + subtitle.
- Two actions: **Go back** (`navigate(-1)`) and **Browse library** (`<Link to="/">`).

---

### Error boundary (`<ErrorBoundary>`)

Wraps the entire app in `main.tsx`. Catches any unhandled render error.

**Dev mode** (`import.meta.env.DEV === true`):
- Red header bar with error name + bug icon.
- Full JavaScript stack trace in a monospace code block.
- React component stack (dimmer, secondary).
- Copy-to-clipboard, "Try again" (remounts subtree), and "Reload page" actions.
- **"Preview customer view" toggle** — switches to the prod screen inline so
  developers can see exactly what a customer would see. A yellow "DEV PREVIEW"
  banner sits at the top of the viewport; "← Back to dev view" restores the
  dev screen. The toggle is local state inside `DevErrorScreen` and has no
  effect on the class component's state or the `handleReset` flow.

**Prod mode** — customer-facing help page (no internal details exposed):
- Moran logo shield + "SOMETHING WENT WRONG" heading.
- Reassurance: "Your library and watchlist are safe — this is a display issue only."
- Numbered "Things to try" card: **Retry**, **Reload the page**, **Clear your cache**.
- "Try again" (remounts subtree) and "Reload page" buttons.
- Contact footer: "Contact support" (`support@moran.app`) and `help.moran.app` link.

In production, add `logErrorToService(error, errorInfo)` inside
`componentDidCatch` to forward errors to Sentry / DataDog.

**`handleReset` and the DevTools kill switch:**

`handleReset` calls `(window as any).__devToolsReset?.()` before calling
`setState`. This is a dev-only hook registered by `DevToolsProvider`. If the
error was triggered by the DevPanel kill switch, `__devToolsReset` clears the
throw-target ref so the re-mounted subtree doesn't immediately re-throw. In prod
and tests the hook is absent and the `?.()` call is a no-op.

---

## DevTools (dev-only)

`AppShell` renders two dev-only components controlled by `DevToolsProvider`:

### DevPanel (floating kill switch)

A "DEV" pill fixed to the bottom-right corner. Clicking it opens a floating
panel with a **Kill switch** that force-throws a render error inside any
registered `<DevThrowTarget>` subtree. Use it to exercise the `ErrorBoundary`
without navigating away.

Add a new target by:
1. Wrapping the component tree in `<DevThrowTarget id="MyPage">`.
2. Adding `{ id: "MyPage", label: "My page" }` to `THROW_TARGETS` in `DevPanel.tsx`.

### How the throw works (React 18 concurrent mode)

React 18 retries renders that throw. To force the `ErrorBoundary` to commit its
fallback, the throw-target ref must stay set across retries:

```
requestThrow("Watchlist")
  → throwTargetRef.current = "Watchlist"; setTick(t+1)
  → DevThrowTarget re-renders, sees ref === id → throws (ref NOT cleared)
  → React retries; ref still set → throws again → ErrorBoundary commits fallback
  → User clicks "Try again" → ErrorBoundary.handleReset calls window.__devToolsReset()
  → ref cleared, tick bumped → DevThrowTarget renders null → success
```

Clearing the ref before throwing is wrong: the retry sees null and succeeds,
so the `ErrorBoundary` never commits its fallback.

---

## Resizable split panes

Both Profiles and Library pages use `useSplitResize(defaultWidth)` from
`src/hooks/useSplitResize.ts` to make the right-pane drag-resizable.

```tsx
const { paneWidth, containerRef, onResizeMouseDown } = useSplitResize(360);

<div
  ref={containerRef}
  className={`split-body${paneOpen ? " pane-open" : ""}`}
  style={paneOpen ? { gridTemplateColumns: `1fr 4px ${paneWidth}px` } : undefined}
>
  <div className="split-left">...</div>
  {paneOpen && <div className="split-resize-handle" onMouseDown={onResizeMouseDown} />}
  <div className="right-pane">...</div>
</div>
```

The `split-body` grid always has **3 columns** (`1fr 0px 0px` when closed,
`1fr 4px Npx` when open) so the column count never changes and the CSS
open/close transition animates cleanly.

The `.split-resize-handle` is a 4px column with a wider click-hit area (±4px
margin/padding). It appears as a 1px line matching the border colour; on hover
it widens to a 4px soft-red strip.

During drag the hook:
1. Adds `.is-resizing` to the container — suppresses the CSS `transition` so
   the pane tracks the pointer without 0.25s lag.
2. Adds `body.resizing` — locks `cursor: col-resize` globally so it doesn't
   flicker as the pointer passes over other elements.
3. Removes both on `mouseup`.

Bounds: min 240px, max 640px.

---

## Tooltips

A pure-CSS tooltip system using data attributes. No JavaScript required.

### `[data-tip]` — tooltip above

```html
<button data-tip="Re-scan">...</button>
```

Generates a tooltip above the element via `::after`. Fades in with a 3px upward
lift on hover.

### `[data-tip-right]` — tooltip to the right

```html
<button data-tip-right="Settings">...</button>
```

Same style, positioned to the right. Used for elements at the left edge.

### `.nav-side-tip` — sidebar collapsed tooltip

Sidebar nav items can't use `::after` (it's reserved for notification badges on
`.notify-amber` items), so each nav item contains an explicit child:

```tsx
<NavLink to="/library" ...>
  <IconFilm className="nav-card-icon" />
  <span className="nav-label">Library</span>
  <span className="nav-side-tip" aria-hidden="true">Library</span>
</NavLink>
```

`.nav-side-tip` is hidden (`display: none`) when the sidebar is expanded (the
label is already visible). When collapsed, it appears to the right of the icon
on hover. The sidebar and nav items override `overflow: hidden → visible` in
collapsed state so the tip can extend beyond the sidebar's right edge.

### Applied to

| Location | Tip text |
|---|---|
| Sidebar nav items (collapsed) | Page name |
| Player: backward skip | `−10s` |
| Player: play/pause | `Play` / `Pause` |
| Player: forward skip | `+10s` |
| Player: volume | `Volume` |
| Player: fullscreen | `Fullscreen` |
| Profiles: profile row re-scan | `Re-scan` |
| Profiles: profile row edit | `Edit` |
| Profiles: film row edit | `Edit link` |
| Profiles: Scan All button | `Rescan all libraries` |
| Library: RE-LINK button | `Re-link metadata` |

---

## URL routing scheme

| URL | Page | Pane / section |
|---|---|---|
| `/` | Profiles | closed |
| `/?pane=new-profile` | Profiles | New Profile form |
| `/?pane=film-detail&filmId=dune-2` | Profiles | Film detail for dune-2 |
| `/library` | Library | closed |
| `/library?film=dune-2` | Library | Film detail for dune-2 |
| `/player/dune-2` | Player | — |
| `/settings` | Settings | General (default) |
| `/settings?section=account` | Settings | Account section |
| `/goodbye` | Goodbye | — |

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
