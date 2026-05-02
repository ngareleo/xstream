# FilmDetailsOverlay (component)

> Status: **baseline** (Spec) · **not started** (Production)
> Spec created: 2026-05-02 — Full-bleed film-details overlay with poster hero, gradient masks, content stack, and glass-pill play CTA with view-transition crossfade.

## Files

- `design/Release/src/components/FilmDetailsOverlay/FilmDetailsOverlay.tsx`
- `design/Release/src/components/FilmDetailsOverlay/FilmDetailsOverlay.styles.ts`

## Purpose

Full-bleed overlay covering the entire viewport when a user selects a film from the Library carousel or search grid (`?film=<id>` set). Renders the film's poster as a hero with Ken Burns animation, gradient overlays, metadata content stack (chips, title, director, plot), and CTAs (Play glass pill, Back pill, Close circle button). Used by Library page when `selectedFilm` is set.

## Visual

### Overlay container (`.overlay`)
- `position: absolute`, `inset: 0`, `overflow: hidden`, `backgroundColor: tokens.colorBg0`.
- Replaces the full page output (not rendered inside the page container) when active.

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

##### Play CTA (glass pill, Liquid Glass)
- **Glass pill (iOS-26 Liquid Glass inspired):**
  - `backgroundColor: rgba(255,255,255,0.12)`.
  - `color: #fff`.
  - `paddingTop/Bottom: 14px`, `paddingLeft: 26px`, `paddingRight: 30px`.
  - `borderRadius: 999px`.
  - `backdropFilter: blur(20px) saturate(180%)`.
  - Beveled-light borders: `boxShadow: inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.20), 0 10px 32px rgba(0,0,0,0.45)`.
  - Mono 12px / 0.18em / uppercase / 600 weight.
- **Hover:** `translateY(-1px)`, bg → `rgba(255,255,255,0.18)`, shadow amplified + subtle white halo.
- **Active (`:active`):** `translateY(0)`, `scale(0.98)`.
- **Inner icon (`& svg`):** **engraved treatment** — `color: rgba(255,255,255,0.55)`, `filter: drop-shadow(0 1px 0.5px rgba(255,255,255,0.45)) drop-shadow(0 -1px 0.5px rgba(0,0,0,0.55))` (recessed-into-glass illusion).
- Contents: `<IconPlay>` + `<span>Play</span>`.
- **`onClick={playWithTransition}`** — uses `document.startViewTransition(() => navigate("/player/{film.id}"))` when available, else plain `navigate(...)`.

##### Filename (`.overlayFilename`)
- Mono 10px, `letterSpacing: 0.06em`, `color: colorTextFaint`.
- Renders `film.filename`.

## Behaviour

### Props

- `film: FilmShape` — the selected film object.
- `onClose: () => void` — callback when Back pill or Close button is clicked. Parent (Library) clears the `?film` URL param.

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

- [ ] Overlay: `position: absolute`, `inset: 0`, `overflow: hidden`, `backgroundColor: colorBg0`
- [ ] Poster: `<Poster>` component fills overlay, **`viewTransitionName: "film-backdrop"`** (MUST match Player)
- [ ] Ken Burns animation: `scale(1.04) translate(-0.4%, -0.3%)` → `scale(1.04) translate(0.4%, 0.3%)`, 26s, ease-in-out, alternate, infinite
- [ ] Gradient overlay: two-gradient `backgroundImage` (vertical + horizontal), `position: absolute`, `inset: 0`, `pointerEvents: none`
- [ ] Back pill: `position: absolute`, `top: 24px`, `left: 28px`, `zIndex: 4`, `<IconBack>` + `"Back"`, Mono 11px uppercase, glass bg, hover green
- [ ] Close button: `position: absolute`, `top: 24px`, `right: 28px`, `zIndex: 4`, 40×40 circular, `<IconClose>`, glass bg, hover green
- [ ] Content stack: `position: absolute`, `left: 60px`, `right: 60px`, `bottom: 72px`, `zIndex: 3`, flex column `rowGap: 14px`, `maxWidth: 720px`
- [ ] Chips row: resolution (green) + HDR + codec + IMDb rating (yellow)
- [ ] Title: Anton 72px uppercase, `lineHeight: 0.95`, `letterSpacing: -0.02em`
- [ ] Meta row: Mono 13px uppercase, `{year} · {genre} · {duration}`, null filtering
- [ ] Director: 13px, `"Directed by "` + name in white (only when `film.director` present)
- [ ] Plot: 15px, `lineHeight: 1.55`, `maxWidth: 640px`, `colorTextDim` (only when `film.plot` present)
- [ ] Play CTA glass pill: `backgroundColor: rgba(255,255,255,0.12)`, `borderRadius: 999px`, `backdropFilter: blur(20px) saturate(180%)`, beveled shadows, Mono 12px uppercase
- [ ] Play CTA hover: `translateY(-1px)`, bg → `rgba(255,255,255,0.18)`, amplified shadow + white halo
- [ ] Play CTA active: `translateY(0)`, `scale(0.98)`
- [ ] Play CTA icon: engraved with drop-shadows (`color: rgba(255,255,255,0.55)` + dual drop-shadow filter)
- [ ] Play button: `<button onClick={playWithTransition}>`, wraps `document.startViewTransition(() => navigate("/player/{id}"))` with plain navigate fallback
- [ ] Filename: Mono 10px, `colorTextFaint`, `film.filename`
- [ ] Back pill and Close button call `onClose()` (parent clears `?film` param)
- [ ] Wire to real Film data (replace mock data)

## TODO(redesign)

None. The design is finalized as of 2026-05-02, PR #48.

## Status

- [x] Designed in `design/Release` lab — FilmDetailsOverlay component extracted from Library inline 2026-05-02, PR #48. Liquid Glass play pill with engraved icon. Real poster with Ken Burns. Gradient overlays. Back/Close CTAs. View-transition naming for coordinated crossfade with Player.
- [ ] Production implementation

## Notes

- **Liquid Glass design:** The glass pill is inspired by iOS-26 design language. The engraved icon (drop-shadows on white text) creates a recessed-into-glass illusion on hover.
- **View Transitions API:** The `viewTransitionName: "film-backdrop"` naming contract with Player ensures a smooth visual morph between the overlay poster and the Player's backdrop when navigating to `/player/:id}`. Without this contract, the transition breaks silently.
- **Ken Burns permanence:** The Ken Burns animation on the poster runs continuously, even while the user reads the content stack. This keeps the visual interest alive without distracting.
