# UI Design Specification — Prerelease (Moran identity)

> **Era status:** frozen. This is the historical snapshot of the **Moran**
> identity (red `#CE1126` accent, Bebas Neue display). The active design
> reference for new work is the **Release** spec —
> [`01-Release-Tokens-And-Layout.md`](01-Release-Tokens-And-Layout.md) — which
> ports these flows into the new **Xstream** identity (green +
> Anton/Inter/JetBrains Mono).

This document describes the intended UI design of the Moran client — its pages,
interactions, URL patterns, and the subtle UX flows that must be preserved
during implementation. The canonical design reference is the React prototype
at `design/Prerelease/` (run with `cd design/Prerelease && bun dev`).

---

## Pages and routes

| Route | Component | Shell |
|---|---|---|
| `/` | Profiles (Dashboard) | AppShell |
| `/library` | Library | AppShell |
| `/settings` | Settings / Setup | AppShell |
| `/player/:videoId` | Player | Full-screen (no shell) |
| `/goodbye` | Goodbye | Full-screen (no shell) |

The Player and Goodbye pages bypass the sidebar + header shell. Every other
page renders inside the two-column `AppShell` grid (sidebar 220px + main 1fr).

---

## Pane routing convention

The Profiles and Library pages each have a right-hand detail pane. **Pane state
must live in the URL search params** — never in component state — so that:
- Opening a pane pushes a browser history entry (Back closes it).
- Deep-linking to a URL with a pane param restores the pane immediately.
- Navigating to the Player and pressing Back returns to the exact pane state.

| Page | Open pane URL | Notes |
|---|---|---|
| Profiles | `/?pane=film-detail&filmId=<id>` | Opens film detail pane |
| Profiles | `/?pane=film-detail&filmId=<id>&linking=true` | Opens film detail pane in RE-LINK mode |
| Profiles | `/?pane=new-profile` | Opens new profile form |
| Library | `/library?film=<id>` | Opens film detail pane |
| Library | `/library?profile=<id>` | Activates profile filter chip |
| Library | `/library?profile=<id>&film=<id>` | Filter + pane both active |

Close by removing all params: `setSearchParams({})`.

Toggle: clicking an item that is already open in the pane **closes** it.

### RE-LINK mode (Profiles)

The `linking` param is URL-encoded so that:
- Switching to a different film always starts with `linking=false` (the new
  `setSearchParams` call omits the param).
- The browser Back button exits RE-LINK mode without closing the pane.
- Clicking the edit icon (✏) on a film row opens the pane **directly** in
  RE-LINK mode (`openFilmLinking` sets `linking=true` in the same call).

### Deep-link auto-expand (Profiles)

When the page mounts with `filmId` in the URL, the profile that contains that
film is automatically added to `expandedIds` (via lazy `useState` initialiser)
so the file is visible in the directory tree without manual expansion.

---

## Split-body layout

Both Profiles and Library use a three-column grid called `split-body`:

```css
/* Always 3 columns so count never changes and CSS transitions work */
.split-body           { grid-template-columns: 1fr 0px 0px;    }  /* pane closed */
.split-body.pane-open { grid-template-columns: 1fr 4px 360px;  }  /* pane open   */
```

The middle column (4px) is a drag-resize handle (`.split-resize-handle`).
When the pane is closed it collapses to 0px along with the right column.

The right pane width is controlled by the `useSplitResize` hook which overrides
`gridTemplateColumns` via an inline style when the user drags the handle. The
CSS `transition` is suppressed while dragging (`.is-resizing` class) and
restored on `mouseup` so the open/close animation is smooth but dragging is
instantaneous.

The transition is animated with CSS (`transition: grid-template-columns 0.25s ease`).

On the Profiles page, the hero slideshow and location breadcrumb live **inside
`split-left`**, not above `split-body`. This ensures the right pane spans the
full height of the main area rather than stopping below the hero.

---

## Player state machine

```
idle  ──(user clicks play)──▶  loading  ──(HTMLVideoElement "playing")──▶  playing
                                                                               │
                                              playing ──("waiting")──▶  loading
                                              playing ──("ended") ──▶  idle
```

State meanings:

| State | Visible UI | Inactivity timer |
|---|---|---|
| `idle` | Pre-play overlay: poster gradient + title + play button | **Suppressed** |
| `loading` | Pre-play overlay: poster gradient + spinner | **Suppressed** |
| `playing` | Video; chrome fades after inactivity | Active (3 000 ms) |

**Critical**: use the `playing` HTMLVideoElement event (not `play`) to transition
`loading → playing`. The `play` event fires before any frames are rendered. `playing`
fires when decoding is actually underway.

---

## Inactivity hide (Player only)

When `playerState === "playing"` and no mouse/keyboard/click event has occurred
for 3 000 ms:

1. Class `controls-hidden` is added to `.player-root`.
2. Topbar, controls, and side panel fade to `opacity: 0; pointer-events: none`.
3. `grid-template-columns` collapses from `1fr 290px` → `1fr 0px` (CSS transition).
4. Cursor hidden (`cursor: none`).

Any interaction calls `resetInactivity()`, which immediately removes the class and
restarts the 3-second countdown.

The timer must **not** start while `playerState === "idle"` — the play button must
never fade out before the user has clicked it.

---

## Navigation rules

1. **All in-app navigation uses React Router `<Link>` or `navigate()`**, never
   `<a href>`. Native anchors bypass the history stack and break Back.

2. **The Player's Back buttons call `navigate(-1)`**, never a hardcoded path.
   The destination varies: the user may have arrived from Profiles, Library, or
   directly. `navigate(-1)` always returns to the correct previous page and state.

3. **Play buttons push to the history stack** (i.e. use `<Link to="/player/:id">`).
   After watching, Back returns to the exact pane state that was open.

---

## Detail pane content

Both Profiles (`FilmDetailPane`) and Library (`DetailPane`) show identical detail
views for a selected film:

| Section | Content |
|---|---|
| Poster area (200px) | Gradient placeholder → real poster/backdrop image |
| Action bar | PLAY (primary), RE-LINK (secondary), × (close) |
| Title / year / genre | From metadata |
| Technical badges | Resolution, HDR format, codec, audio codec, channels |
| IMDb row | Rating (yellow) + duration |
| Synopsis | Full plot text |
| Cast | Chip list |
| File table | Filename, container, size, bitrate, frame rate |

The PLAY button must use `<Link>` (not a native anchor) to preserve history.

---

## Player side panel

The right panel in the Player (290px, always visible alongside the video) contains:

**Now Playing** (head section):
- Film title, year · genre · duration
- Plot (truncated to 3 lines with `-webkit-line-clamp`)

**Up Next**:
- Up to 4 matched films from the same library, excluding the current one.
- Each row has a thumbnail (gradient placeholder), title, genre, and a play chip.
- Clicking navigates to `/player/:id`.

**From Your Watchlist**:
- First 4 watchlist items.
- Green "✓ On disk" when the film exists locally; muted "Not on disk yet" when absent.
- Only on-disk items show a play chip.

**Footer**:
- "Open in VLC": passes local file path to the `vlc://` URL scheme.
- "Back": `navigate(-1)`.

---

## Unmatched files

A file is "unmatched" when it has no linked metadata (title, year, poster, etc).
The design communicates this clearly but non-destructively:

| Location | Indicator |
|---|---|
| Profiles dir tree | Yellow warning icon; "Link" button instead of play |
| Library grid | Centred question-mark icon on the poster |
| Profiles match bar | Yellow fill + yellow percentage text |
| Player watchlist | Muted "Not on disk yet" text, no play button |

---

## Scanning state

A profile that is actively being scanned shows:
- Spinning indicator + `done/total` count in the Matched column.
- "Scanning…" text in the Actions column (edit/refresh buttons hidden).
- The profile row gets a `.scanning` class for any additional CSS treatment.

In production, the scanning state is driven by the `scanLibraries` mutation result
and the `scanProgress` subscription.

---

## Slideshow (Profiles hero)

- Images cycle every 5 seconds.
- Crossfade transition: 0.8s ease.
- Caption shows the image filename (bottom-right).
- Dot indicators (bottom-right) allow manual navigation.
- The slideshow fills the entire `dashboard-hero` container absolutely
  (`position: absolute; inset: 0`).
- The greeting overlay sits on top at z-index 2, covering only the left ~380px
  with a gradient that fades to transparent, leaving the photo visible on the right.

---

## Loading states

### Global loading bar

A 3px fixed bar at the top of the viewport (below the 52px header) indicates
page-level data loading. It replaces per-page skeleton screens as the primary
loading affordance.

Pages call `usePageLoading(loading)` to signal load state. `LoadingBarProvider`
counts active loaders; the bar stays visible until all have resolved. This
handles simultaneous loaders during tab switches gracefully.

**Animation phases:**

| Phase | CSS | Description |
|---|---|---|
| `loading` | `lb-grow` keyframe (8s, deceleration) | Fake progress: eases from 0% → 88% |
| `completing` | `lb-complete` keyframe (600ms) | Snaps to 100%, fades out |
| `idle` | `display: none` | Bar hidden |

The bar uses `transform: scaleX()` with `transform-origin: left` — no layout reflow.
A sheen sweep and a pulsing spark dot at the leading edge add visual depth.

### Design lab vs production

In the design lab, pages call `useSimulatedLoad()` (700ms) and pass the result
to `usePageLoading()`. In production, replace `useSimulatedLoad` with the actual
Relay loading state — the `usePageLoading` call and loading bar remain unchanged.

---

## Error states

### 404 — Not Found

Rendered by a catch-all `<Route path="*">` inside the AppShell routes. The
page uses the same atmospheric treatment (grain + radial gradient) as the
Player's idle overlay to keep the error state within the design language.

Key elements:
- `404` in Bebas Neue at very low opacity (ghost mark, not a banner)
- "PAGE NOT FOUND" heading + one-line subtitle
- **Go back** (`navigate(-1)`) + **Browse library** (`<Link to="/">`) — never
  hardcode a redirect destination

In production, map this to a React Router `<Route path="*">` inside the app
shell routes with a real `NotFoundPage` component.

### ErrorBoundary

A React class component wrapping the entire app (above `<BrowserRouter>`).
Two display modes:

**Dev** — `import.meta.env.DEV`:
```
┌──────────────────────────────────────────────────────────────┐
│ 🐛 Unhandled render error  [Preview customer view] [Copy] [Retry] │
├──────────────────────────────────────────────────────────────┤
│ Error message (monospace)                                    │
├──────────────────────────────────────────────────────────────┤
│ JAVASCRIPT STACK                                             │
│ <pre> full stack trace </pre>                                │
├──────────────────────────────────────────────────────────────┤
│ REACT COMPONENT STACK                                        │
│ <pre> component tree </pre>                                  │
└──────────────────────────────────────────────────────────────┘
```

"Preview customer view" toggles to the prod screen with a yellow "DEV PREVIEW"
banner at the top. "← Back to dev view" restores the dev screen. This lets
developers verify what customers see without switching to a prod build.

**Prod** — customer-facing help page (no stack traces, no internal details):
- Logo shield + "SOMETHING WENT WRONG" heading
- Reassurance: library and watchlist are safe, display issue only
- Numbered "Things to try" card: Retry → Reload → Clear cache
- "Try again" and "Reload page" buttons
- Contact footer: `support@moran.app` and `help.moran.app`

Implementation notes:
- `getDerivedStateFromError` captures the error for render.
- `componentDidCatch` is where to call `logErrorToService(error, errorInfo)`.
- "Try again" calls `setState({ hasError: false })` which re-mounts the subtree.
- Wrapping `<BrowserRouter>` means routing state also resets on retry — intentional.

### Goodbye page (`/goodbye`)

Full-screen farewell shown after sign-out confirmation. Same atmospheric
language as the Player idle overlay and 404 page. Auto-redirects to `/` after
4 seconds; "Back to home" button skips the wait.

---

## Profile menu and sign-out flow

The user row at the bottom of the sidebar opens a popover menu positioned
above it (or to the right in collapsed state).

**Menu items:**
- User info header (avatar, name, email) — non-interactive
- Profiles list — each navigates to `/library?profile=<id>` (Library filtered to that profile)
- Go to home → `/`
- Account settings → `/settings?section=account`
- Sign out → confirmation dialog

**Sign-out confirmation dialog:**
A modal with a blurred backdrop. "Cancel" dismisses; "Sign out" navigates to
`/goodbye`. The dialog renders outside the sidebar in a portal-like pattern
(sibling of `<nav>` inside the React tree) so it isn't clipped by the sidebar's
`overflow`.

**Settings section deep-link:**
`Settings` reads `?section=<id>` on mount and activates the matching section.
Invalid or absent values fall back to `"general"`. This is the only Settings
URL param — section changes during a session remain in component state and do
not update the URL.

---

## Styling system

All component styles use **Griffel** (`@griffel/react`) — atomic CSS-in-JS.
There are no per-component `.css` files. The rule is:

- Each component has a colocated `ComponentName.styles.ts` that exports a
  `useComponentNameStyles` hook built with `makeStyles`.
- Conditional classes use `mergeClasses(s.base, condition && s.modifier)`.
- `shared.css` is kept intentionally minimal: only global resets, CSS variable
  declarations (the `--*` tokens), base element rules, `@keyframes`, scrollbar
  overrides, `[data-tip]` tooltip attributes, and `body.resizing`.
- `design.css` contains only the AppShell grid-area assignments for React Router
  page roots (`.app-shell > .main`, `.app-shell > header.app-header`).

**Forbidden patterns:**
- Raw `className="..."` string literals referencing CSS class names in JSX.
- Inline styles for anything that belongs in a design token.
- Shorthand CSS properties that Griffel rejects (`borderColor`, `borderStyle`) —
  use longhands (`borderTopColor`, `borderTopWidth: "0"`, etc.).

---

## Library page

### Profile filter

The active profile filter lives in the `?profile=<id>` URL param, not component
state. This allows:
- The profile menu to deep-link directly to a filtered view.
- Bookmarking a filtered library URL.
- Back navigation restoring the filter.

`buildParams` is a local helper that preserves the current `profile` param when
opening/closing the film detail pane, so the filter is never lost on pane
interactions.

### Scroll fade

The grid and list scrollable areas are wrapped in a `scrollWrap` div that has a
`::before` gradient overlay (`#080808 → transparent`, 48px tall). The overlay:
- Has `opacity: 0` by default (no fade when at the top — labels are fully visible).
- Transitions to `opacity: 1` (`0.2s ease`) as soon as `scrollTop > 0`.
- Resets to hidden when the user switches between grid and list views.

Implementation: `onScroll` on the scrollable element sets `scrolled` state;
`mergeClasses(s.scrollWrap, scrolled && s.scrollWrapScrolled)` applies the
modifier. `pointerEvents: none` ensures the overlay never blocks interactions.

---

## Design tokens (reference)

```css
--red:        #CE1126   /* primary accent */
--black:      #080808   /* app background */
--surface:    #0F0F0F   /* panels */
--surface2:   #161616   /* cards, inputs */
--border:     #222222   /* dividers */
--muted:      #666666   /* secondary text */
--green:      #27AE60   /* on-disk, success */
--yellow:     #F5C518   /* IMDb, warnings */
--font-head:  'Bebas Neue'
--font-body:  'Inter'
--transition: 0.15s ease
```
