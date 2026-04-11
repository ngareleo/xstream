# UI Design Specification

This document describes the intended UI design of the Moran client — its pages,
interactions, URL patterns, and the subtle UX flows that must be preserved during
implementation. The canonical design reference is the React prototype at
`design/` (run with `cd design && bun dev`).

---

## Pages and routes

| Route | Component | Shell |
|---|---|---|
| `/` | Profiles (Dashboard) | AppShell |
| `/library` | Library | AppShell |
| `/watchlist` | Watchlist | AppShell |
| `/settings` | Settings / Setup | AppShell |
| `/player/:videoId` | Player | Full-screen (no shell) |

The Player bypasses the sidebar + header shell. Every other page renders inside
the two-column `AppShell` grid (sidebar 220px + main 1fr).

---

## Pane routing convention

The Profiles and Library pages each have a right-hand detail pane. **Pane state
must live in the URL search params** — never in component state — so that:
- Opening a pane pushes a browser history entry (Back closes it).
- Deep-linking to a URL with a pane param restores the pane immediately.
- Navigating to the Player and pressing Back returns to the exact pane state.

| Page | Open pane URL | Param key |
|---|---|---|
| Profiles | `/?pane=film-detail&filmId=<id>` | `filmId` |
| Profiles | `/?pane=new-profile` | — |
| Library | `/library?film=<id>` | `film` |

Close by removing all params: `setSearchParams({})`.

Toggle: clicking an item that is already open in the pane **closes** it.

---

## Split-body layout

Both Profiles and Library use a two-column grid called `split-body`:

```css
.split-body           { grid-template-columns: 1fr 0px;   }   /* pane closed */
.split-body.pane-open { grid-template-columns: 1fr 360px; }   /* pane open   */
```

The transition is animated with CSS (`transition: grid-template-columns 0.25s ease`).
No JavaScript is needed for the animation.

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
