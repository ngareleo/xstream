---
name: implement-design
description: Port a page or component from the design lab (design/Release/) into the production client (client/src/). Use when implementing a new page, matching a design spec, or porting UI from the design sandbox.
allowed-tools: Bash(bun *) Bash(cd *)
---

# Implement Design Spec

Use this skill when porting a page or component from the design lab into the
production client (`client/src/`).

The design lab is split into two eras:

- **`design/Release/`** — the **active** Xstream identity (green +
  Anton/Inter/JetBrains Mono). All new ports source from here.
- **`design/Prerelease/`** — the **frozen** Moran identity (red + Bebas Neue).
  Used for behavior reference when the Release JSX is structurally similar but
  not yet documented for that specific UX flow.

## Where to look (Release — primary source)

| Design lab | Production equivalent |
|---|---|
| `design/Release/src/pages/Profiles/Profiles.tsx` | `client/src/pages/ProfilesPage.tsx` + `ProfilesPageContent.tsx` |
| `design/Release/src/pages/Library/Library.tsx` | `client/src/pages/LibraryPage.tsx` + `LibraryPageContent.tsx` |
| `design/Release/src/pages/Player/Player.tsx` | `client/src/pages/PlayerPage.tsx` + component tree |
| `design/Release/src/pages/Settings/Settings.tsx` | `client/src/pages/SettingsPage.tsx` |
| `design/Release/src/pages/DesignSystem/DesignSystem.tsx` | (no prod equivalent — review-only) |
| `design/Release/src/components/DetailPane/DetailPane.tsx` | `VideoDetailsPanel` + `VideoDetailsPanelAsync` |
| `design/Release/src/components/Logo/` | `client/src/components/brand/` (after final logo selection) |
| `design/Release/src/data/mock.ts` | GraphQL schema + Relay fragments |
| `design/Release/src/styles/tokens.ts` + `shared.css` | Production Griffel tokens + global CSS |
| `design/Release/README.md` | Authoritative UI spec for the Xstream identity |
| `docs/design/UI-Design-Spec/01-Release-Tokens-And-Layout.md` | Concise implementation reference (active) |

## Where to look (Prerelease — behavior reference)

When the Release spec is silent on a UX invariant (e.g. RE-LINK mode, scan
subscriptions, exact pane param keys), fall back to the Prerelease spec —
the contract ports verbatim:

| Design lab | Use for |
|---|---|
| `design/Prerelease/src/pages/Dashboard/Dashboard.tsx` | Profiles deep-link auto-expand logic, RE-LINK mode |
| `design/Prerelease/src/pages/Library/Library.tsx` | Scroll-fade overlay implementation |
| `design/Prerelease/src/pages/Player/Player.tsx` | Pre-play overlay state machine prose |
| `design/Prerelease/README.md` | Long-form description of every page (Profiles section is the most thorough) |
| `docs/design/UI-Design-Spec/00-Prerelease-Tokens-And-Layout.md` | Original tokens + behavior contract (frozen) |

Always read the relevant Release file **and** `design/Release/README.md`
before writing production code. Cross-check against Prerelease when a
specific behavior is missing from Release.

---

## Cross-reference checklist

Before writing any production code for a page or component, verify:

### Data layer mapping
Read the design component and find every place `data/mock.ts` is accessed.
Map each one to a GraphQL field:

| Mock access | GraphQL equivalent |
|---|---|
| `profiles` list | `viewer { libraries { edges { node { ... } } } }` |
| `films.filter(f => f.profile === id)` | `library { videos { edges { node { ... } } } }` |
| `getFilmById(id)` | `node(id: $id) { ... on Video { ... } }` |
| `user.name` | `viewer { username }` |
| `watchlist` | `viewer { watchlist { ... } }` |
| `film.gradient` | Computed from poster dominant colour (not in schema — derive client-side) |
| `profile.scanning` | `library { scanStatus }` subscription field |
| `profile.scanProgress` | `library { scanProgress { done total } }` |

### State management mapping
Design lab uses `useSearchParams` for pane state. In production, same pattern applies:
- `useSearchParams` from `react-relay` is **not** a thing — use React Router's `useSearchParams`.
- Pages (`*Page.tsx` / `*PageContent.tsx`) are the only files that call `useLazyLoadQuery`.
- Components receive fragment `$key` props, never raw data.

### UX invariants to preserve (from `design/README.md`)

1. **Pane state in URL search params.** Never `useState` for pane open/closed.
   - Profiles: `?pane=film-detail&filmId=<globalId>`
   - Library:  `?film=<globalId>`
   - Use the video's GraphQL global ID (not local DB id) as the URL param.

2. **Toggle/deselect.** Clicking an already-selected card/row must close the pane.
   ```ts
   const selectFilm = (id: string) => {
     if (selectedId === id) setSearchParams({});
     else setSearchParams({ film: id });
   };
   ```

3. **Back button = `navigate(-1)`**, not hardcoded paths. Both the Player topbar
   and footer Back buttons must use `navigate(-1)`.

4. **Play buttons use `<Link>`**, not `<a href>`. This pushes to the history stack
   so Back in the Player returns to the correct pane state.

5. **Player state machine.** The three states (`idle`, `loading`, `playing`) map to:
   - `idle` → MSE pipeline not started; show poster overlay
   - `loading` → `startPlayback()` called (fires `START_TRANSCODE_MUTATION`); spinner
   - `playing` → `playing` HTMLVideoElement event fired; overlay dismissed
   
   Wire transition from loading → playing on the `playing` event (not `play`).
   The `play` event fires before frames are rendered; `playing` fires when decoding begins.

6. **Inactivity hide must be suppressed when idle.** Start the 3-second timer only
   after `playerState === "playing"`. If the timer runs while idle, the play button
   disappears before the user can click it.

7. **Hero inside split-left.** On the Profiles page, the slideshow/greeting hero and
   the location breadcrumb must be children of `split-left`, not siblings of `split-body`.
   This ensures the right pane spans the full height of the main area.

8. **Scan state is a subscription.** The `scanning` boolean and `scanProgress` on a
   library must come from the `transcodeJobUpdated` / `scanProgress` subscription,
   not a polling query. Use `useSubscription` in `ProfilesPageContent`.

---

## Page implementation steps

### Profiles page

1. Read `design/Release/src/pages/Profiles/Profiles.tsx` (visual treatment) AND
   `design/Prerelease/src/pages/Dashboard/Dashboard.tsx` (full behavior prose).
2. `ProfilesPage.tsx` → Suspense shell only (no logic).
3. `ProfilesPageContent.tsx`:
   - `useLazyLoadQuery` for the profiles + viewer query.
   - `useSearchParams` for pane state (`pane`, `filmId` params).
   - Subscribe to scan progress via `useSubscription`.
   - Pass fragment keys to `ProfileRow` components — no raw data props.
4. `ProfileRow` → Relay fragment on `Library`.
5. `FilmRow` → Relay fragment on `Video`.
6. Detail pane → `VideoDetailsPanel` + `VideoDetailsPanelAsync`.
7. New profile pane → wires to `createLibrary` mutation.

Check that:
- [ ] Pane opens/closes via URL params (not component state)
- [ ] Second click on a row closes the pane
- [ ] Hero is inside `split-left`, not above `split-body`
- [ ] Scanning state animates correctly while a scan is running
- [ ] Play links use `<Link to="/play/:videoId">`, not `<a href>`

### Library page

1. Read `design/Release/src/pages/Library/Library.tsx` (visual + chips +
   grid/list treatment) AND `design/Prerelease/src/pages/Library/Library.tsx`
   (scroll-fade implementation).
2. `LibraryPage.tsx` → Suspense shell.
3. `LibraryPageContent.tsx`:
   - `useLazyLoadQuery` for libraries + videos.
   - `useSearchParams` for `?film=<id>` pane param.
   - Pass `LibraryContent_library` fragment keys to `LibraryContent`.
4. `LibraryContent` → existing Relay fragment per library.
5. `MediaGridItem` → existing fragment per video (add 4K badge, rating display).
6. Detail pane → `VideoDetailsPanel`.

Check that:
- [ ] `?film=<id>` opens the pane on page load (deep link works)
- [ ] Second click on a poster closes the pane
- [ ] Search filters in the loaded Relay store (client-side, no re-fetch)
- [ ] Play links use `<Link>`

### Player page

1. Read `design/Release/src/pages/Player/Player.tsx` AND
   `design/Prerelease/src/pages/Player/Player.tsx` — the state-machine
   comments in the Prerelease file are still essential reference.
2. `PlayerPage.tsx` → loads video metadata, renders `VideoPlayer` + `PlayerSidebarAsync`.
3. Player state machine maps to `useVideoPlayback` hook states:
   - Design `"idle"` → `status === "idle"`
   - Design `"loading"` → `status === "loading"` (after `startPlayback()`)
   - Design `"playing"` → `status === "playing"` (after `playing` event)
4. Inactivity hook: extract from design into `useInactivity(ms)` returning `hidden: boolean`.
5. Pre-play overlay → new `PlayerIdleOverlay` component.
6. `ControlBar` → existing component; verify resolution select fires the right event.
7. Back buttons → both use `navigate(-1)`.
8. Fullscreen → `requestFullscreen()` on the player root element.

Check that:
- [ ] Player starts in idle state — no stream until user clicks play
- [ ] Loading spinner shows between `startPlayback()` and first `playing` event
- [ ] Inactivity timer does not start until `playerState === "playing"`
- [ ] Controls fade + grid collapses to full-width video after 3 000 ms
- [ ] Any interaction restores controls immediately
- [ ] navigate(-1) from both Back buttons
- [ ] Video ends → returns to idle state

---

## Visual details to check

These details are easy to miss but visible in the design. Verify each one:

**Player topbar:**
- The vertical divider between the Back link and the film title is 1px, 14px tall,
  `rgba(255,255,255,0.12)`.
- Resolution badge is red only for 4K; gray for all others.
- HDR suffix appears alongside the 4K badge when `hdr` is truthy.

**Player controls:**
- Progress track is 4px tall, `rgba(255,255,255,0.10)` background.
- Buffered layer: `rgba(255,255,255,0.07)`.
- Played layer: `var(--red)`.
- Thumb: 14px circle, `var(--white)`, red glow shadow.
- Gradient scrim runs from `rgba(0,0,0,0.96)` at bottom to transparent.

**Player side panel:**
- Watchlist "On disk" text is `var(--green)`; "Not on disk yet" is `rgba(255,255,255,0.3)`.
- Plot is truncated to 3 lines with `-webkit-line-clamp: 3`.
- Panel `backdrop-filter: blur(20px)` — verify this renders against the video.

**Idle overlay:**
- Play button is 72×72px circle, `rgba(206,17,38,0.15)` fill, `rgba(206,17,38,0.5)` border.
- Button scales to 1.06 on hover, 0.97 on active.
- Icon has `padding-left: 4px` to optically centre the play triangle.
- Film title uses `var(--font-head)` (Bebas Neue), 22px.

**Profiles page:**
- Unmatched files show a yellow warning icon, not a document icon.
- Unmatched files show a "Link" button styled with `color: var(--yellow)`.
- Match bar turns yellow (`warn` class) when `unmatched > 0`.
- Scanning row: spinner + `done/total` in the Matched column; "Scanning…" in Actions.

**Library page:**
- Unmatched posters show a centred question-mark SVG at 40% opacity.
- Selected poster card has a red border ring.
- Section head shows icon (film/tv) + name + count + "View all" link.

---

## After implementing

```bash
# Regenerate Relay artifacts
cd client && bun relay

# Type-check
cd client && bun run lint

# Visual verify — run Playwright against the real app
cd client && bun dev &
cd server && bun dev &
# Navigate to each route and compare against design lab screenshots
```


## After writing — notify architect

If this task edited code or docs, spawn the `architect` subagent before marking it complete:

- **Files changed** — paths touched by `Write`/`Edit` during the task.
- **Description** — one sentence on what changed.
- **Why** — fix / feature / refactor, with issue or memory link if applicable.

Architect decides whether `docs/`, `docs/SUMMARY.md`, or the architect index needs updating, and does so directly. For trivial changes (typo, lint-only) say so explicitly — architect logs and skips. See `CLAUDE.md → Update protocol`.
