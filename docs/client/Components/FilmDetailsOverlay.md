# FilmDetailsOverlay

Full-bleed overlay shown when a movie tile is clicked on the homepage (`?film=<id>`). Renders the film's poster as a hero with Ken Burns animation, gradient overlays, metadata content stack, and CTAs (Play glass pill, Back pill, Close button).

**Movies only.** TV shows have a sibling [`ShowDetailsOverlay`](ShowDetailsOverlay.md) keyed on `?show=<id>`; the homepage routes to one or the other based on which URL param is set.

**Source:** `client/src/components/film-details-overlay/`
**Used by:** `HomePageContent` (when `selectedFilm` is set).

## Role

Full-viewport film detail view with animated hero poster, metadata, and play/close actions. Optionally renders a "You might also like" carousel below. Used as the primary detail surface when a film is selected from library browse.

## Props

| Prop | Type | Notes |
|---|---|---|
| `film` | `FilmShape` | The selected film object. |
| `copies` | `FilmCopyNode[] \| undefined` | Video copies for this film (from `film.copies`). Optional; not all films have multiple copies. |
| `suggestions` | `OverlaySuggestion[]` | Films for the "You might also like" carousel. Each entry carries `{ filmId: string, video: VideoNode }` — the Film global ID **and** the Video node (poster, resolution, etc.). |
| `onClose` | `() => void` | Back pill / Close button callback. |
| `onSelectSuggestion` | `(filmId: string) => void` | Suggestion tile click — receives the **Film** id (not the Video id). |
| `selectedCopyId` | `string \| undefined` | The user's selected copy ID (if multiple copies are available). Defaults to `film.bestCopy.id`. |
| `onSelectCopy` | `(videoId: string) => void` | Callback when the user picks a different copy from the variant selector. |

## Layout & styles

### Overlay container (`.overlay`)

- `position: absolute`, `inset: 0`, `overflow-y: auto`, `backgroundColor: tokens.colorBg0`.
- Scrollable vertically when suggestions are present below the hero.

### Hero section (`.hero`)

- `position: relative`, `width: 100%`, `height: 100vh`, `overflow: hidden`.
- Fixed viewport; suggestions carousel sits **below** this outside the `.hero` div.

### Background poster

- `<Poster>` fills the overlay, `position: absolute`, `inset: 0`, `objectFit: cover`.
- **`viewTransitionName: "film-backdrop"`** — MUST match Player's backdrop for view-transition morphing.
- Ken Burns animation: `scale(1.04) translate(-0.4%, -0.3%)` → `scale(1.04) translate(0.4%, 0.3%)` over 26 seconds, ease-in-out, alternate, infinite.

### Gradient overlay

- `position: absolute`, `inset: 0`, `pointerEvents: none`.
- Two-gradient `backgroundImage`:
  - Vertical: `linear-gradient(180deg, rgba(5,7,6,0.45) 0%, transparent 25%, transparent 38%, rgba(5,7,6,0.85) 72%, ${tokens.colorBg0} 100%)`.
  - Horizontal: `linear-gradient(90deg, rgba(5,7,6,0.5) 0%, transparent 35%)`.

### Top actions container (`.topActions`)

- `position: absolute`, `top: 24px`, `right: 28px`, `zIndex: 4`.
- Flex row, `gap: 12px`, `alignItems: center`.
- Contains the "Open in Profile" secondary CTA and the Close button (both are flex children, no individual positioning).

#### "Open in Profile" button

- **Secondary CTA** (`.secondaryCta`) — restrained mono text-link with a folder icon.
  - `<IconFolder>` (12×12) + `<span>"Open in Profile"</span>` (Mono 11px, uppercase, underlined).
  - At rest: text `rgba(255,255,255,0.75)`, icon `rgba(255,255,255,0.55)`, underline `rgba(255,255,255,0.25)`.
  - Hover: text `#fff`, icon `colorGreen`, underline `colorGreen`.
  - No background or border; transparent background, inline-flex layout with 8px gap.
- Click: `navigate("/profiles?film=${film.bestCopy.id}")` — opens the Profiles page with the detail pane pre-selected on this film. The Profiles page restores last-opened state from localStorage, so it lands on the correct film.

#### Close button

- 40×40, inline-flex centred, `border-radius: 50%`.
- `backgroundColor: rgba(0,0,0,0.45)`, 1px solid `colorBorder`.
- Contains `<IconClose>`. Hover: `backgroundColor: rgba(0,0,0,0.7)`, border → `colorGreen`.
- Calls `onClose()`.

### Content stack (`.overlayContent`)

- `position: absolute`, `left: 60px`, `right: 60px`, `bottom: 72px`, `zIndex: 3`.
- `display: flex`, `flexDirection: column`, `rowGap: 14px`, `maxWidth: 720px`.

#### Chips row

- Resolution chip (green) + HDR + codec + IMDb rating (yellow, if present) + availability chip (if unavailable).
- **Availability chip** (`.chipOffline`): renders only when the selected copy's owning library has `status === "OFFLINE"`. Mono 11px, `backgroundColor: rgba(220,53,69,0.15)`, text `colorRed`, border `1px solid colorRed`. Content: `"Offline"`.

#### Title

- Anton 72px, `color: colorText`, **`lineHeight: 0.95`**, `letterSpacing: -0.02em`, uppercase.
- Prefers `data.metadata?.title` (OMDb-sanitised) over `data.title` (filename fallback). Renders `metadata.title ?? title || "Unmatched file"`.

#### Meta row

- Mono 13px, `color: colorTextDim`, uppercase. `{year} · {genre} · {duration}` with null filtering.

#### Director line

- 13px, `color: colorTextMuted`. Text: `"Directed by "` + `<span>{director}</span>` (white).
- Rendered only when `film.director` is truthy.

#### Plot paragraph

- 15px, `lineHeight: 1.55`, `color: colorTextDim`, `maxWidth: 640px`.
- Rendered only when `film.plot` is truthy.

#### Copies rail (FilmVariants, conditional)

- **Rendered only when `!isSeries && variantOptions.length > 1`.**
- Mounted as `<aside className={seasonsRail} aria-label={copiesAriaLabel}>` with a `railBody` wrapper.
- Displays the copy picker (FilmVariants component) allowing the user to select which encoding to play if multiple main-role videos exist.
- Uses the same `seasonsRail` styling as the seasons explorer to maintain visual consistency.
- See [`FilmVariants.md`](FilmVariants.md) for full spec.

#### Seasons rail (TV series, conditional)

- **Rendered only when `isSeries && seasonCount > 0`.**
- Mounted as `<aside className={seasonsRail} aria-label={seasonsAriaLabel}>` with header and scroll container.
- Contains the seasons explorer (SeasonsPanel) and episode availability stats.
- Uses the same `seasonsRail` styling as the copies picker to maintain visual consistency.

#### Content narrowing via `hasRail`

- When **either** rail is present (`(isSeries && seasonCount > 0) || (!isSeries && variantOptions.length > 1)`), the main content column applies the `contentWithRail` class to reduce max-width and allow space for the rail.
- This ensures the content adapts the same way whether showing seasons (TV) or variant copies (movies with multiple encodings).

#### Actions row

- Flex row, `columnGap: 12px`, `alignItems: center`, `marginTop: 8px`.
- Now holds only the Play CTA and the filename (variant selector moved to right-side rail).

##### Play CTA (glass pill)

**Enabled state:**

- At rest: `backgroundColor: rgba(255,255,255,0.12)`, `borderRadius: 999px`, `backdropFilter: blur(20px) saturate(180%)`, beveled-light inset borders.
- Mono 12px, `letterSpacing: 0.18em`, uppercase, `color: #fff`.
- **Hover** (dimmed "lighted sign"):
  - `transform: translateY(-1px)`.
  - `backgroundColor: oklch(0.78 0.20 150 / 0.18)` (green-tinted glass).
  - Borders: alpha-gradient `oklch(0.78 0.20 150 / α)` from top bright (0.55) → bottom dim (0.25).
  - `color: tokens.colorGreen`.
  - **Text-shadow:** `0 0 4px (colorGreenGlow / 0.35), 0 0 18px colorGreen` (dimmed two-layer glow).
  - **Box-shadow:** inset green top + outer 14px ambient glow `colorGreenGlow / 0.18` (narrower halo than early variants).
- Icon (at rest): engraved white, `drop-shadow` recessed effect.
- Icon (hover): green, `drop-shadow(0 0 4px colorGreen) drop-shadow(0 0 12px colorGreenGlow)`.
- Active: `transform: translateY(0) scale(0.98)`.
- Contents: `<IconPlay>` + `"Play"`.
- Click: `document.startViewTransition(() => navigate("/player/{film.id}"))` with plain navigate fallback.

**Unavailable state** (`.playCtaDisabled` — when selected copy's library is `OFFLINE`):

- Visually disabled (dimmed, cursor `not-allowed`) but remains **clickable** (not the native `disabled` attribute).
- At rest: `backgroundColor: rgba(255,255,255,0.06)`, `color: colorTextMuted`, no hover effects.
- Click: shows a toast error (see Behaviour § Unavailable playback).
- Icon: dimmed, no drop-shadow effects.

##### Filename

- Mono 10px, `letterSpacing: 0.06em`, `color: colorTextFaint`.
- Renders `film.filename`.

#### Scroll hint

- `position: absolute`, `bottom: -44px` (below action row).
- Mono 10px uppercase, `color: colorTextFaint`.
- Renders `"▾ scroll for suggestions"` (only when suggestions present).
- Pulsing animation: 1.8s ease-in-out, opacity 0.4 → 0.85, `translateY(0 → 3px)`.
- `aria-hidden="true"`.

### Suggestions carousel (below hero)

- Rendered only when `suggestions.length > 0`.
- `paddingTop: 40px`, `paddingBottom: 60px`, `backgroundColor: tokens.colorBg0`.
- `<PosterRow title="You might also like">` wraps `<FilmTile>` cards.
- Each `OverlaySuggestion` carries `{ filmId, video }`. Click handler: calls `onSelectSuggestion(filmId)` (passing the **Film** id) and scrolls overlay to top. The Film id routes to `?film=<filmId>` in `HomePageContent`, opening the correct overlay entry.

**Bug fix (shipped in `fix/seven-bugs-auth-profiles-detail`):** Suggestions previously carried only the `bestCopy` Video id, and `handleSuggestionClick` used that Video id as the Film id in the `rows.find` lookup. Because Film ids and Video ids are different global IDs, the lookup always missed — the overlay replaced itself with the home grid instead of showing the selected suggestion's details. `pickSuggestions` now returns `{ filmId, video }` pairs and `handleSuggestionClick` receives the Film id directly.

## Behaviour

### Availability check

The overlay reads `library.status` from the selected copy's owning library (resolved via the `Video.library` field; no schema change). A film/episode whose library is `OFFLINE` is unavailable:

- **Chips row:** appends an `"Offline"` chip (`.chipOffline`) in red.
- **Play CTA:** renders visually disabled (`.playCtaDisabled`) with muted styling and no hover effects; remains clickable.
- **Click handling:** clicking an unavailable Play CTA fires a toast error (see § Toast integration).

**Known limitation:** Availability is read at Home query time, so the overlay reflects library status as-of Home page load, not as-of overlay open. Live availability updates (via the `profileAvailabilityUpdated` subscription) do not refresh the overlay's cached fragment data. This is intended for v1 (the Profiles page has live updates; Home is stateless browse). A future iteration may subscribe to live changes on the detail overlay itself.

For picked variant fallback: if the selected copy is unavailable, availability is determined by the selected copy's library; if no explicit copy is selected, availability falls back to the source video's library.

**Episode availability:** TV episodes have the same contract — `playEpisode` mutation is guarded by the show's library status (or the selected copy's library status if multiple copies exist).

### Toast integration

Uses the `useToast()` hook to emit error notifications. The overlay's Storybook stories decorator includes `withNovaEventing` so story renders can trigger and assert toast events.

**Unavailable toast:** clicking a disabled Play CTA on an unavailable video calls `showToast({ variant: "error", message: "Unavailable — this title's library is offline." })`. The toast system (see [`Toast.md`](Toast.md)) renders a red-bordered card in the bottom-right viewport that auto-dismisses after 3 seconds.

### View Transitions contract

`.overlayPoster` has **`viewTransitionName: "film-backdrop"`**. This name must exactly match Player's backdrop element for smooth morphing during navigation.

### Scroll-to-top on suggestion click

When a suggestion tile is clicked and `onSelectSuggestion` is provided, the overlay smoothly scrolls to `top: 0` after the view transition.

## Data

**Relay fragments:**

- `FilmDetailsOverlay_video` — the Video node (via the clicked film's `bestCopy`). Selects: `id`, `title`, `filename`, `metadata { title, year, genre, duration, director, plot, imdbRating }`, `resolution`, `videoCodec`, `hdrFormat`, `library { status }`.
- `HomeFilmsSection_video` — used by the suggestions carousel to render `FilmTile` cards. Now includes `library { status }` for availability gating.

The `library { status }` field uses the existing `Video.library: Library!` resolver (no schema change) and enables availability checks at render time without requiring a dedicated subscription.

## Strings

FilmDetailsOverlay.strings.ts exports:

- `openInProfile` — "Open in Profile", aria-label for the "Open in Profile" button in the top actions cluster.
- `closeAriaLabel` — "Close", aria-label for the close button.
- `copiesAriaLabel` — aria-label for the copies rail (when multiple encodings are available).
- `seasonsAriaLabel` — aria-label for the seasons rail (TV series only).
- `offlineChip` — "Offline", displayed in the chips row when a library is offline.
- `unavailableToast` — "Unavailable — this title's library is offline.", shown as a toast when clicking Play on an offline video.

## Notes

Outstanding work tracked in [`Outstanding-Work.md`](../../release/Outstanding-Work.md#film-details-overlay).
- **Storybook decorator update:** `FilmDetailsOverlay.stories.tsx` now includes `withNovaEventing` so test stories can assert `useToast` calls and render-time toast events.
