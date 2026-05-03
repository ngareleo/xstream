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
| `suggestions` | `Film[]` | Films for the "You might also like" carousel. |
| `onClose` | `() => void` | Back pill / Close button callback. |
| `onSelectSuggestion` | `(id: string) => void` | Suggestion tile click (optional; defaults to `/player/:id`). |
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

### Back pill (top-left)

- `position: absolute`, `top: 24px`, `left: 28px`, `zIndex: 4`.
- `<IconBack>` + `<span>Back</span>`, inline-flex, `columnGap: 8px`.
- `paddingTop/Bottom: 8px`, `paddingLeft: 12px`, `paddingRight: 16px`, `borderRadius: 999px`.
- `backgroundColor: rgba(0,0,0,0.45)`, 1px solid `colorBorder`, Mono 11px uppercase.
- Hover: `backgroundColor: rgba(0,0,0,0.7)`, border + text → `colorGreen`.
- Calls `onClose()`.

### Close button (top-right)

- `position: absolute`, `top: 24px`, `right: 28px`, `zIndex: 4`.
- 40×40, inline-flex centred, `border-radius: 50%`.
- `backgroundColor: rgba(0,0,0,0.45)`, 1px solid `colorBorder`.
- Contains `<IconClose>`. Hover: `backgroundColor: rgba(0,0,0,0.7)`, border → `colorGreen`.
- Calls `onClose()`.

### Content stack (`.overlayContent`)

- `position: absolute`, `left: 60px`, `right: 60px`, `bottom: 72px`, `zIndex: 3`.
- `display: flex`, `flexDirection: column`, `rowGap: 14px`, `maxWidth: 720px`.

#### Chips row

- Resolution chip (green) + HDR + codec + IMDb rating (yellow, if present).

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

#### Seasons rail (legacy — TV branch deprecated)

The seasons-rail branch in this overlay is **deprecated**. TV-show overlays now live in [`ShowDetailsOverlay`](ShowDetailsOverlay.md). This component still reads a `Video.show.seasons` chain to support the rare case where a movie's video has a show coordinate (it renders empty on null), but the routing-level decision between film vs show happens in `HomePageContent`.

#### Actions row

- Flex row, `columnGap: 12px`, `alignItems: center`, `marginTop: 8px`.

##### Variant selector (FilmVariants component, conditional)

- **Rendered only when `copies && copies.length > 1`.**
- Mounted as `<FilmVariants copies={copies} selectedCopyId={selectedCopyId} onSelectCopy={onSelectCopy} />`.
- Displays a dropdown button showing the current copy's resolution (e.g., "4K", "1080p").
- Lets the user pick which encoding to play if multiple main-role videos exist.
- See [`FilmVariants.md`](FilmVariants.md) for full spec.

##### Play CTA (glass pill)

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
- Click handler on tile: calls `onSelectSuggestion(id)` if provided (and scrolls overlay to top), else navigates to `/player/{id}`.

## Behaviour

### View Transitions contract

`.overlayPoster` has **`viewTransitionName: "film-backdrop"`**. This name must exactly match Player's backdrop element for smooth morphing during navigation.

### Scroll-to-top on suggestion click

When a suggestion tile is clicked and `onSelectSuggestion` is provided, the overlay smoothly scrolls to `top: 0` after the view transition.

## Notes

Outstanding work tracked in [`Outstanding-Work.md`](../../release/Outstanding-Work.md#film-details-overlay).
