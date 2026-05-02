# FilmDetailsOverlay (component)

> Status: **done** (Spec) · **not started** (Production)
> Spec updated: 2026-05-02 — Play CTA glass pill now lights up green on hover (oklch(0.78 0.20 150 / α) with alpha-gradient borders, green text-shadow + glowing outer box-shadow; icon gets drop-shadow green filters). Added bottom scroll section with "You might also like" carousel (PosterRow + FilmTile components). Scroll hint text animates up-down below the action row when suggestions are present. Overlay now has `overflow-y: auto` for scrollable content. Hero section restructured: 100vh relative container (`hero`) holds poster + gradients + content stack; `suggestions` section rendered below with 40/60px padding.
> Audited: 2026-05-02 — flagged invalid `tokens.colorGreenGlow / 0.35` formula and pinned alpha-substitution rule for production; clarified `pickSuggestions` ownership (LibraryPage); added Strings + Stories (M4 audit pass).

## Files

- `design/Release/src/components/FilmDetailsOverlay/FilmDetailsOverlay.tsx`
- `design/Release/src/components/FilmDetailsOverlay/FilmDetailsOverlay.styles.ts`

## Purpose

Full-bleed overlay covering the entire viewport when a user selects a film from the Library carousel or search grid (`?film=<id>` set). Renders the film's poster as a hero with Ken Burns animation, gradient overlays, metadata content stack (chips, title, director, plot), and CTAs (Play glass pill, Back pill, Close circle button). Used by Library page when `selectedFilm` is set.

## Visual

### Overlay container (`.overlay`)
- `position: absolute`, `inset: 0`, `overflow-y: auto`, `backgroundColor: tokens.colorBg0`.
- Scrollable — when suggestions are present below the hero, the page scrolls vertically to reveal them.
- Replaces the full page output (not rendered inside the page container) when active.
- Supports scroll-to-top on suggestion click: when `onSelectSuggestion` is called, the overlay smoothly scrolls to `top: 0`.

### Hero section (`.hero`)
- `position: relative`, `width: 100%`, `height: 100vh`, `overflow: hidden`.
- Contains all fixed-viewport elements: poster, gradients, content stack. The suggestions carousel sits **below** this hero section outside the `.hero` div, allowing both hero and suggestions to scroll together.

### Background poster (`.overlayPoster`)
- `<Poster>` component fills the overlay (`position: absolute`, `inset: 0`, `width: 100%`, `height: 100%`, `objectFit: cover`).
- **`viewTransitionName: "film-backdrop"`** — MUST stay in sync with Player's `.backdrop` rule. If they diverge, the view-transition morph silently breaks.
- Ken Burns animation: `scale(1.04) translate(-0.4%, -0.3%)` → `scale(1.04) translate(0.4%, 0.3%)` over **26 seconds**, ease-in-out, alternate, infinite.
- **Full-color** (no grayscale filter, unlike the hero).

### Gradient overlay (`.overlayGradient`)
- `position: absolute`, `inset: 0`, `pointerEvents: none`.
- Two-gradient `backgroundImage`:
  - Vertical: `linear-gradient(180deg, rgba(5,7,6,0.45) 0%, transparent 25%, transparent 38%, rgba(5,7,6,0.85) 72%, ${tokens.colorBg0} 100%)`.
  - Horizontal: `linear-gradient(90deg, rgba(5,7,6,0.5) 0%, transparent 35%)`.

### Back pill (`.overlayBack`) — top-left
- `position: absolute`, `top: 24px`, `left: 28px`, `zIndex: 4`.
- `<IconBack>` + `<span>Back</span>` in inline-flex row, `columnGap: 8px`.
- `paddingTop/Bottom: 8px`, `paddingLeft: 12px`, `paddingRight: 16px`.
- `backgroundColor: rgba(0,0,0,0.45)`, 1px solid `colorBorder` all sides, `borderRadius: 999px`.
- Mono 11px, `letterSpacing: 0.16em`, uppercase, `color: colorText`.
- Hover: `backgroundColor: rgba(0,0,0,0.7)`, border all sides → `colorGreen`, `color: colorGreen`.
- `aria-label="Back to home"`. Calls `onClose()`.

### Close button (`.overlayClose`) — top-right
- `position: absolute`, `top: 24px`, `right: 28px`, `zIndex: 4`.
- 40×40, inline-flex centred.
- `backgroundColor: rgba(0,0,0,0.45)`, 1px solid `colorBorder` all sides, `borderRadius: 50%`.
- Contains `<IconClose>`, `aria-label="Close details"`.
- Hover: `backgroundColor: rgba(0,0,0,0.7)`, border all sides → `colorGreen`.
- Calls `onClose()`.

### Content stack (`.overlayContent`) — lower area
- `position: absolute`, **`left: 60px`**, **`right: 60px`**, **`bottom: 72px`**, `zIndex: 3`.
- `display: flex`, `flexDirection: column`, `rowGap: 14px`, `maxWidth: 720px`.

#### Chips row (`.overlayChips`)
- `display: flex`, `columnGap: 8px`, `alignItems: center`.
- Contains (in order):
  - Resolution chip: `<span className="chip green">{film.resolution}</span>`.
  - HDR chip (if `film.hdr && film.hdr !== "—"`): `<span className="chip">{film.hdr}</span>`.
  - Codec chip (if `film.codec`): `<span className="chip">{film.codec}</span>`.
  - IMDb rating (if `film.rating !== null`): `<span overlayRating>` — inline-flex, `columnGap: 5px`, Mono 11px, `color: colorYellow`, `paddingLeft: 4px`. Contains `<ImdbBadge>` + rating number.

#### Title (`.overlayTitle`)
- **Anton** 72px / `color: colorText` / **`lineHeight: 0.95`** / `letterSpacing: -0.02em`, uppercase.
- Renders `film.title || "Unmatched file"`.

#### Meta row (`.overlayMetaRow`)
- Mono 13px / `letterSpacing: 0.08em` / `color: colorTextDim` / uppercase.
- Renders `{year} · {genre} · {duration}` via `filter(v => v !== null && v !== undefined).join(" · ")`.

#### Director line (`.overlayDirector`)
- 13px, `color: colorTextMuted`.
- Text: `"Directed by "` + `<span overlayDirectorName>{director}</span>` (`color: colorText`).
- Rendered only when `film.director` is truthy.

#### Plot paragraph (`.overlayPlot`)
- **15px** / **`lineHeight: 1.55`** / `color: colorTextDim` / **`maxWidth: 640px`**.
- Rendered only when `film.plot` is truthy.

#### Seasons rail (`.seasonsRail`) — right side, series only
- **Only rendered when `film.kind === "series"` and `film.seasons` is truthy.**
- `position: absolute`, `top: 84px`, `right: 60px`, `bottom: 72px`, `width: 380px`, `zIndex: 2`.
- `display: flex`, `flexDirection: column`.
- **Glass treatment:** `backgroundColor: rgba(20,28,24,0.55)` (green-tinted glass, similar to header), `backdropFilter: blur(20px) saturate(1.6)`, `borderRadius: 3px`, `border: 1px solid rgba(37,48,42,0.45)`, `boxShadow: inset 0 1px 0 rgba(255,255,255,0.05)`.
- **Header row (`seasonsRailHeader`):** `paddingTop: 12px`, `paddingBottom: 12px`, `paddingLeft: 16px`, `paddingRight: 16px`, `borderBottom: 1px solid rgba(37,48,42,0.45)`, `display: flex`, `justifyContent: space-between`, `alignItems: center`.
  - Left: `"SEASONS"` label (Mono 10px, uppercase, `colorTextDim`).
  - Right: `"{episodesOnDisk}/{totalEpisodes} ON DISK"` (Mono 10px, uppercase, `colorGreen`).
- **Body scroll area:** `flex: 1`, `overflow-y: auto`, `paddingTop: 12px`, `paddingBottom: 12px`, `paddingLeft: 12px`, `paddingRight: 12px`.
- Renders `<SeasonsPanel seasons={film.seasons} defaultOpenFirst={true} onSelectEpisode={playEpisode} />` — season 1 opens by default. Available episodes are clickable; clicking one calls `playEpisode(seasonNumber, episodeNumber)` which navigates to `/player/{filmId}?s={seasonNumber}&e={episodeNumber}`.
- **Content max-width adjustment** (`contentWithRail` on the main content stack): when the rail is present, the overlay's content stack shrinks from `maxWidth: 720px` to `maxWidth: 560px` so the title block does not collide visually with the glass rail.

#### Actions row (`.overlayActions`)
- `display: flex`, `alignItems: center`, `columnGap: 20px`, `marginTop: 8px`.

##### Play CTA (glass pill, Liquid Glass with dimmed green hover)
- **Glass pill (iOS-26 Liquid Glass inspired):**
  - `backgroundColor: rgba(255,255,255,0.12)`.
  - `color: #fff`.
  - `paddingTop/Bottom: 14px`, `paddingLeft: 26px`, `paddingRight: 30px`.
  - `borderRadius: 999px`.
  - `backdropFilter: blur(20px) saturate(180%)`.
  - Beveled-light borders: `boxShadow: inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.20), 0 10px 32px rgba(0,0,0,0.45)`.
  - Mono 12px / 0.18em / uppercase / 600 weight.
  - Transition: `transitionProperty: transform, box-shadow, background-color, color, border-color, text-shadow`, `transitionDuration: 0.18s`, `transitionTimingFunction: ease-out`.
- **Hover:** Dimmed "lighted sign" effect — reduced glow compared to earlier sessions.
  - `transform: translateY(-1px)`.
  - `backgroundColor: oklch(0.78 0.20 150 / 0.18)` (green-tinted glass).
  - Border colours (alpha-gradient): `borderTopColor: oklch(0.78 0.20 150 / 0.55)` (bright top), `borderRightColor: oklch(0.78 0.20 150 / 0.4)`, `borderBottomColor: oklch(0.78 0.20 150 / 0.25)` (dim bottom), `borderLeftColor: oklch(0.78 0.20 150 / 0.4)`.
  - `color: tokens.colorGreen`.
  - **Dimmed text-shadow:** `textShadow: 0 0 4px {colorGreenGlow @ α=0.35}, 0 0 18px {colorGreen}` — reduced from the bright variant (outer halo ambient from 80px → suppressed; inner focus narrowed). The text glows softly without the aggressive outer corona. **Production note:** `colorGreenGlow` already includes alpha; for the `@ 0.35` form, derive an explicit `rgba(...)` by sampling the underlying RGB of `colorGreenGlow` and using `0.35` as the alpha — `${tokens.colorGreenGlow / 0.35}` is invalid CSS.
  - **Dimmed outer box-shadow:** `boxShadow: inset 0 1px 0 oklch(0.78 0.20 150 / 0.55), inset 0 -1px 0 rgba(0,0,0,0.20), 0 14px 40px rgba(0,0,0,0.55), 0 0 14px {colorGreenGlow @ α=0.18}` — ambient glow reduced to 14px with α=0.18 (from earlier 32px + 80px dual halos). Same alpha-substitution rule as text-shadow.
- **Active (`:active`):** `transform: translateY(0) scale(0.98)`.
- **Inner icon (`& svg`):** **engraved treatment at rest** — `color: rgba(255,255,255,0.55)`, `filter: drop-shadow(0 1px 0.5px rgba(255,255,255,0.45)) drop-shadow(0 -1px 0.5px rgba(0,0,0,0.55))` (recessed-into-glass illusion). **On hover (`:hover svg`):** `color: tokens.colorGreen`, `filter: drop-shadow(0 0 4px ${tokens.colorGreen}) drop-shadow(0 0 12px ${tokens.colorGreenGlow})` (green glow on icon).
- Contents: `<IconPlay>` + `<span>Play</span>`.
- **`onClick={playWithTransition}`** — uses `document.startViewTransition(() => navigate("/player/{film.id}"))` when available, else plain `navigate(...)`.

##### Filename (`.overlayFilename`)
- Mono 10px, `letterSpacing: 0.06em`, `color: colorTextFaint`.
- Renders `film.filename`.

#### Scroll hint (`.scrollHint`)
- Positioned absolutely `bottom: -44px` (just below the action row).
- Mono 10px, `letterSpacing: 0.18em`, uppercase, `color: colorTextFaint`.
- Renders `"▾ scroll for suggestions"` (only when suggestions are present).
- Pulsing animation: `0%, 100%` → `opacity: 0.4, translateY(0)` | `50%` → `opacity: 0.85, translateY(3px)`. Duration 1.8s, infinite, ease-in-out. Invites the user to scroll down.
- `aria-hidden="true"` — decorative hint only.

### Suggestions carousel (`.suggestions`)
- Rendered **after** the hero section, only when `suggestions.length > 0`.
- `paddingTop: 40px`, `paddingBottom: 60px`, `backgroundColor: tokens.colorBg0`.
- Contains a `<PosterRow title="You might also like">` component wrapping `<FilmTile>` cards for each suggestion.
- Click handler on each tile: calls `onSelectSuggestion(id)` if provided, which also triggers a scroll-to-top animation on the overlay (`overlayRef.current?.scrollTo({ top: 0, behavior: "smooth" })`), OR navigates to `/player/{id}` if callback not provided.

### Suggestion scoring — owned by LibraryPage, not the overlay

`pickSuggestions(film, all): Film[]` lives on `LibraryPage` (the parent). The overlay receives the result via the `suggestions` prop — it never computes scores itself. Ranking heuristic:

1. **Director match:** if same director, +50 points.
2. **Profile match:** same library profile, +8 points.
3. **Genre overlap:** for each genre token >2 chars, +12 points if found in the suggestion's genre.
4. **Resolution match:** same resolution, +2 points.
5. **Self-exclusion:** the current film is never included.
6. **Cap:** results limited to 8 tiles.

## Behaviour

### Props

- `film: FilmShape` — the selected film object.
- `suggestions?: Film[]` — films to render in the "You might also like" carousel (default: empty array, no carousel shown).
- `onClose: () => void` — callback when Back pill or Close button is clicked. Parent (Library) clears the `?film` URL param.
- `onSelectSuggestion?: (id: string) => void` — optional callback when a suggestion tile is clicked. If not provided, defaults to navigating to `/player/{id}`.

### View Transitions contract

The `.overlayPoster` element has **`viewTransitionName: "film-backdrop"`**. This name must exactly match the Player page's `.backdrop` element's `viewTransitionName`. The browser's View Transition API uses this name to morph between the two elements during the `/player/:id` navigation. If the names diverge, the transition silently breaks and the page snaps without animation.

### Play button action
- Uses `document.startViewTransition()` for a smooth visual crossfade when transitioning to `/player/:id}`.
- Falls back to plain navigation on browsers that don't support View Transitions.

## Changes from Prerelease

- **Extraction:** OLD — the overlay was inline inside Library.tsx. NEW — FilmDetailsOverlay is a standalone component.
- **Hero:** OLD — gradient placeholder (no real image). NEW — real Poster component with Ken Burns animation.
- **Play CTA:** OLD — solid green 3px-radius button. NEW — glass pill (Liquid Glass design) with engraved icon and smooth lift on hover.
- **Poster identification:** OLD — no transition naming. NEW — `viewTransitionName: "film-backdrop"` for coordinated morphing with the Player page.

## Porting checklist (`client/src/components/FilmDetailsOverlay/`)

### Hero section
- [ ] Overlay: `position: absolute`, `inset: 0`, `overflow-y: auto`, `backgroundColor: colorBg0` (scrollable for suggestions below)
- [ ] Hero: `position: relative`, `width: 100%`, `height: 100vh`, `overflow: hidden` (fixed viewport, contains poster + content)
- [ ] Poster: `<Poster>` component fills hero, **`viewTransitionName: "film-backdrop"`** (MUST match Player)
- [ ] Ken Burns animation: `scale(1.04) translate(-0.4%, -0.3%)` → `scale(1.04) translate(0.4%, 0.3%)`, 26s, ease-in-out, alternate, infinite
- [ ] Gradient overlay: two-gradient `backgroundImage` (vertical + horizontal), `position: absolute`, `inset: 0`, `pointerEvents: none`
- [ ] Back pill: `position: absolute`, `top: 24px`, `left: 28px`, `zIndex: 4`, `<IconBack>` + `"Back"`, Mono 11px uppercase, glass bg (`rgba(0,0,0,0.45)`), hover green
- [ ] Close button: `position: absolute`, `top: 24px`, `right: 28px`, `zIndex: 4`, 40×40 circular, `<IconClose>`, glass bg, hover green
- [ ] Content stack: `position: absolute`, `left: 60px`, `right: 60px`, `bottom: 72px`, `zIndex: 3`, flex column `rowGap: 14px`, `maxWidth: 720px`
- [ ] Chips row: resolution (green) + HDR + codec + IMDb rating (yellow)
- [ ] Title: Anton 72px uppercase, `lineHeight: 0.95`, `letterSpacing: -0.02em`
- [ ] Meta row: Mono 13px uppercase, `{year} · {genre} · {duration}`, null filtering
- [ ] Director: 13px, `"Directed by "` + name in white (only when `film.director` present)
- [ ] Plot: 15px, `lineHeight: 1.55`, `maxWidth: 640px`, `colorTextDim` (only when `film.plot` present)
- [ ] **Seasons rail (`.seasonsRail`, series only):** `position: absolute`, `top: 84px`, `right: 60px`, `bottom: 72px`, `width: 380px`, `zIndex: 2` (rendered only when `film.kind === "series"` && `film.seasons` truthy)
  - [ ] Glass treatment: `backgroundColor: rgba(20,28,24,0.55)`, `backdropFilter: blur(20px) saturate(1.6)`, `borderRadius: 3px`, `border: 1px solid rgba(37,48,42,0.45)`, subtle inset highlight
  - [ ] Header row: `display: flex`, `justifyContent: space-between`, "SEASONS" label (left, muted Mono 10px) + episode count (right, green Mono 10px) `"{onDisk}/{total} ON DISK"`
  - [ ] Body: `flex: 1`, `overflow-y: auto`, render `<SeasonsPanel seasons={film.seasons} defaultOpenFirst={true} onSelectEpisode={playEpisode} />`
  - [ ] `playEpisode(s, e)` helper: calls `navigate(\`/player/\${film.id}?s=\${s}&e=\${e}\`)`
  - [ ] Content max-width adjustment: when rail is present, reduce overlay content max-width from 720px → 560px (`contentWithRail` class) to prevent title collision
- [ ] Play CTA glass pill (at rest): `backgroundColor: rgba(255,255,255,0.12)`, `borderRadius: 999px`, `backdropFilter: blur(20px) saturate(180%)`, beveled-light borders, Mono 12px uppercase
- [ ] Play CTA transition: `transitionProperty: transform, box-shadow, background-color, color, border-color, text-shadow`, `0.18s`, `ease-out`
- [ ] Play CTA **hover — dimmed "lighted sign" effect:**
  - [ ] `transform: translateY(-1px)`
  - [ ] `backgroundColor: oklch(0.78 0.20 150 / 0.18)` (green-tinted glass)
  - [ ] Borders: alpha-gradient from top bright (0.55) → left/right (0.4) → bottom dim (0.25) in green (`oklch(0.78 0.20 150 / α)`)
  - [ ] `color: tokens.colorGreen`
  - [ ] `textShadow: 0 0 4px (colorGreenGlow / 0.35), 0 0 18px colorGreen` (dimmed two-layer: tight inner focus, soft ambient — NOT the bright variant)
  - [ ] `boxShadow: inset green top highlight + shadow + 14px ambient glow (colorGreenGlow / 0.18)` (narrower halo; NOT the earlier 32px + 80px dual halos)
- [ ] Play CTA icon (at rest): engraved — `color: rgba(255,255,255,0.55)`, `filter: drop-shadow(0 1px ...) drop-shadow(0 -1px ...)` (white recessed shadows)
- [ ] Play CTA icon **hover:** `color: tokens.colorGreen`, `filter: drop-shadow(0 0 4px colorGreen) drop-shadow(0 0 12px colorGreenGlow)` (green glowing)
- [ ] Play CTA active: `transform: translateY(0) scale(0.98)`
- [ ] Scroll hint (`.scrollHint`): Mono 10px uppercase, positioned `bottom: -44px`, renders `"▾ scroll for suggestions"` (only when suggestions present), pulsing animation (1.8s, 0.4 → 0.85 opacity, `translateY(0→3px)`), `aria-hidden="true"`
- [ ] Play button: `<button onClick={playWithTransition}>`, wraps `document.startViewTransition(() => navigate("/player/{id}"))` with plain navigate fallback
- [ ] Filename: Mono 10px, `colorTextFaint`, `film.filename`
- [ ] Back pill and Close button call `onClose()` (parent clears `?film` param)

### Suggestions carousel (below hero)
- [ ] Suggestions section (`.suggestions`): rendered only when `suggestions.length > 0`, **after** the hero section (not inside it)
- [ ] Padding: `paddingTop: 40px`, `paddingBottom: 60px`, `backgroundColor: colorBg0` (matches overlay bg)
- [ ] `<PosterRow title="You might also like">` container
- [ ] Map suggestions to `<FilmTile>` components
- [ ] FilmTile click handler: calls `onSelectSuggestion(id)` if provided (and scrolls overlay to top via `overlayRef.current?.scrollTo({ top: 0, behavior: "smooth" })`), else navigates to `/player/{id}`

### Props and wiring
- [ ] Accept props: `film: FilmShape`, `suggestions?: Film[]` (default: []), `onClose: () => void`, `onSelectSuggestion?: (id: string) => void`
- [ ] Wire to real Film data (replace mock data)
- [ ] Verify `viewTransitionName: "film-backdrop"` matches Player's backdrop view-transition name

## Strings (`FilmDetailsOverlay.strings.ts`)

| Key | Value | Used as |
|---|---|---|
| `play` | `"Play"` | Play CTA label |
| `back` | `"Back"` | Back pill label |
| `backAriaLabel` | `"Back to home"` | Back pill aria-label |
| `closeAriaLabel` | `"Close details"` | Close button aria-label |
| `unmatched` | `"Unmatched file"` | Title fallback when `film.title` is null |
| `directedBy` | `"Directed by "` | Director-line prefix |
| `seasons` | `"SEASONS"` | Seasons rail header |
| `onDiskFormat` | `"{onDisk}/{total} ON DISK"` | Seasons rail header right side |
| `youMightAlsoLike` | `"You might also like"` | Suggestions row title (passed to `<PosterRow title>`) |
| `scrollHint` | `"▾ scroll for suggestions"` | Bottom-of-hero pulsing hint |

## Stories (`FilmDetailsOverlay.stories.tsx`)

| Story | Setup | What it verifies |
|---|---|---|
| Movie | `kind: "MOVIE"`, no suggestions | Hero with poster, content stack, no rail, no scroll hint |
| MovieWithSuggestions | + `suggestions: [8 films]` | Scroll hint pulses; PosterRow renders below hero |
| Series | `kind: "SERIES"` + `seasons` | Right-side seasons rail, content stack max-width 560px |
| SeriesWithSuggestions | series + suggestions | Both rail and bottom carousel render |
| UnmatchedFile | `title: null, plot: null, year: null` | Title falls back to "Unmatched file"; meta row collapses |
| LongPlot | 600-char plot | Wraps inside 640px max-width |
| HoverPlay | parameter-pseudo on Play CTA | Glass pill green-tinted, icon green, dimmed glow |

## TODO(redesign)

None. The design is finalized as of 2026-05-02, PR #48.

## Status

- [x] Designed in `design/Release` lab — FilmDetailsOverlay extracted from Library 2026-05-02 PR #48. Hero section: 100vh fixed container with poster + gradients + content stack. Play CTA glass pill with **green "lighted sign" hover** (oklch(0.78 0.20 150 / α) bg + alpha-gradient borders + two-layer text-shadow glow + outer green box-shadow halos; icon gets green drop-shadow filters). Scroll hint animates below action row when suggestions present. Suggestions carousel (`.suggestions` section, 40/60px padding) renders below hero with `<PosterRow>` + `<FilmTile>` tiles; click handler calls `onSelectSuggestion(id)` (or navigates to player if not provided). Overlay scrollable when suggestions extend below viewport. View-transition naming (`viewTransitionName: "film-backdrop"`) for coordinated morphing with Player. **TV-show support added 2026-05-02, PR #49:** Right-side glass `seasonsRail` (380px wide, top:84 / right:60 / bottom:72) renders for series films. Header shows total episode count (green, right-aligned). Body contains `<SeasonsPanel defaultOpenFirst={true} />` for scrollable season/episode browsing. When rail is present, main content stack max-width reduces from 720px → 560px (`contentWithRail` class) to prevent title collision.
- [ ] Production implementation

## Notes

- **Liquid Glass design:** The glass pill is inspired by iOS-26 design language. The engraved icon (drop-shadows on white text) creates a recessed-into-glass illusion on hover.
- **View Transitions API:** The `viewTransitionName: "film-backdrop"` naming contract with Player ensures a smooth visual morph between the overlay poster and the Player's backdrop when navigating to `/player/:id}`. Without this contract, the transition breaks silently.
- **Ken Burns permanence:** The Ken Burns animation on the poster runs continuously, even while the user reads the content stack. This keeps the visual interest alive without distracting.
