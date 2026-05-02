# FilmDetailsOverlay (component)

> Status: **baseline** (Spec) · **not started** (Production)
> Spec updated: 2026-05-02 — Play CTA glass pill now lights up green on hover (oklch(0.78 0.20 150 / α) with alpha-gradient borders, green text-shadow + glowing outer box-shadow; icon gets drop-shadow green filters). Added bottom scroll section with "You might also like" carousel (PosterRow + FilmTile components). Scroll hint text animates up-down below the action row when suggestions are present. Overlay now has `overflow-y: auto` for scrollable content. Hero section restructured: 100vh relative container (`hero`) holds poster + gradients + content stack; `suggestions` section rendered below with 40/60px padding.

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

#### Actions row (`.overlayActions`)
- `display: flex`, `alignItems: center`, `columnGap: 20px`, `marginTop: 8px`.

##### Play CTA (glass pill, Liquid Glass with green "neon sign" hover)
- **Glass pill (iOS-26 Liquid Glass inspired):**
  - `backgroundColor: rgba(255,255,255,0.12)`.
  - `color: #fff`.
  - `paddingTop/Bottom: 14px`, `paddingLeft: 26px`, `paddingRight: 30px`.
  - `borderRadius: 999px`.
  - `backdropFilter: blur(20px) saturate(180%)`.
  - Beveled-light borders: `boxShadow: inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.20), 0 10px 32px rgba(0,0,0,0.45)`.
  - Mono 12px / 0.18em / uppercase / 600 weight.
  - Transition: `transitionProperty: transform, box-shadow, background-color, color, border-color, text-shadow`, `transitionDuration: 0.18s`, `transitionTimingFunction: ease-out`.
- **Hover:** "Lighted sign" effect — the glass lights up green as if a neon sign is activating.
  - `transform: translateY(-1px)`.
  - `backgroundColor: oklch(0.78 0.20 150 / 0.18)` (green-tinted glass).
  - Border colours (alpha-gradient): `borderTopColor: oklch(0.78 0.20 150 / 0.55)` (bright top), `borderRightColor: oklch(0.78 0.20 150 / 0.4)`, `borderBottomColor: oklch(0.78 0.20 150 / 0.25)` (dim bottom), `borderLeftColor: oklch(0.78 0.20 150 / 0.4)`.
  - `color: tokens.colorGreen`.
  - `textShadow: 0 0 6px ${tokens.colorGreenGlow}, 0 0 18px ${tokens.colorGreen}` (two-layer green text glow).
  - `boxShadow: inset 0 1px 0 oklch(0.78 0.20 150 / 0.55), inset 0 -1px 0 rgba(0,0,0,0.20), 0 14px 40px rgba(0,0,0,0.55), 0 0 32px ${tokens.colorGreenGlow}, 0 0 80px oklch(0.78 0.20 150 / 0.30)` (inset green highlight + outer green halos at 32px and 80px).
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
- Click handler on each tile: calls `onSelectSuggestion(id)` if provided, else navigates to `/player/{id}`.

### Suggestion scoring (from Library page)

The `pickSuggestions(film, all)` helper (used by Library when rendering FilmDetailsOverlay) ranks suggestions by:

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
- [ ] Play CTA glass pill (at rest): `backgroundColor: rgba(255,255,255,0.12)`, `borderRadius: 999px`, `backdropFilter: blur(20px) saturate(180%)`, beveled-light borders, Mono 12px uppercase
- [ ] Play CTA transition: `transitionProperty: transform, box-shadow, background-color, color, border-color, text-shadow`, `0.18s`, `ease-out`
- [ ] Play CTA **hover — "lighted sign" effect:**
  - [ ] `transform: translateY(-1px)`
  - [ ] `backgroundColor: oklch(0.78 0.20 150 / 0.18)` (green-tinted glass)
  - [ ] Borders: alpha-gradient from top bright (0.55) → left/right (0.4) → bottom dim (0.25) in green (`oklch(0.78 0.20 150 / α)`)
  - [ ] `color: tokens.colorGreen`
  - [ ] `textShadow: 0 0 6px colorGreenGlow, 0 0 18px colorGreen` (two-layer green glow)
  - [ ] `boxShadow: inset green top highlight + amplified shadow + outer green halos at 32px + 80px`
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
- [ ] FilmTile click handler: calls `onSelectSuggestion(id)` if provided, else navigates to `/player/{id}`

### Props and wiring
- [ ] Accept props: `film: FilmShape`, `suggestions?: Film[]` (default: []), `onClose: () => void`, `onSelectSuggestion?: (id: string) => void`
- [ ] Wire to real Film data (replace mock data)
- [ ] Verify `viewTransitionName: "film-backdrop"` matches Player's backdrop view-transition name

## TODO(redesign)

None. The design is finalized as of 2026-05-02, PR #48.

## Status

- [x] Designed in `design/Release` lab — FilmDetailsOverlay extracted from Library 2026-05-02 PR #48. Hero section: 100vh fixed container with poster + gradients + content stack. Play CTA glass pill with **green "lighted sign" hover** (oklch(0.78 0.20 150 / α) bg + alpha-gradient borders + two-layer text-shadow glow + outer green box-shadow halos; icon gets green drop-shadow filters). Scroll hint animates below action row when suggestions present. Suggestions carousel (`.suggestions` section, 40/60px padding) renders below hero with `<PosterRow>` + `<FilmTile>` tiles; click handler calls `onSelectSuggestion(id)` (or navigates to player if not provided). Overlay scrollable when suggestions extend below viewport. View-transition naming (`viewTransitionName: "film-backdrop"`) for coordinated morphing with Player.
- [ ] Production implementation

## Notes

- **Liquid Glass design:** The glass pill is inspired by iOS-26 design language. The engraved icon (drop-shadows on white text) creates a recessed-into-glass illusion on hover.
- **View Transitions API:** The `viewTransitionName: "film-backdrop"` naming contract with Player ensures a smooth visual morph between the overlay poster and the Player's backdrop when navigating to `/player/:id}`. Without this contract, the transition breaks silently.
- **Ken Burns permanence:** The Ken Burns animation on the poster runs continuously, even while the user reads the content stack. This keeps the visual interest alive without distracting.
