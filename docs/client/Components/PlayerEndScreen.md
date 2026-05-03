# PlayerEndScreen

Post-playback overlay. Appears when video reaches end. Displays "UP NEXT" label and up to 4 suggestion cards (title, poster thumb, year). Primary action is a Replay button; each card is a clickable link to play that film. Lazy-loaded via Suspense to avoid blocking initial playback render.

**Source:** `client/src/components/player-end-screen/`
**Used by:** `VideoPlayer` (rendered conditionally when `isEnded && true`, wrapped in Suspense with null fallback).

## Role

Post-playback discovery surface. Surfaces suggestions from the same library, enabling quick navigation to related content or replay of the current film. Intentionally minimal — no metadata editing, no analytics, purely navigational.

## Props

| Prop | Type | Notes |
|---|---|---|
| `video` | `PlayerEndScreen_video$key` | Relay fragment ref. Carries `id` and `library { videos(first: 6) { edges { node { id, title, metadata { year, posterUrl } } } } }`. |

## Layout & styles

### Overlay (`.overlay`)

- `position: absolute`, `inset: 0`, `zIndex: 10` (sits above ControlBar, below none).
- `backgroundColor: rgba(8,8,8,0.92)` — semi-transparent dark background.
- `display: flex`, `flexDirection: column`, `alignItems: center`, `justifyContent: center`, `gap: 28px`, `padding: 24px`.
- Full-area scrim, centered content layout.

### Label (`.label`)

- `fontSize: 10px`, `fontWeight: 700`, `letterSpacing: 0.2em`, `textTransform: uppercase`, `color: rgba(255,255,255,0.3)`.
- Displays `"UP NEXT"`.

### Cards grid (`.cards`)

- `display: flex`, `flexDirection: row`, `gap: 12px`, `justifyContent: center`, `flexWrap: wrap`.
- Horizontal flex layout, wraps on small screens.

### Card (`.card`, link element)

- `display: flex`, `flexDirection: column`, `width: 120px`, `gap: 6px`, `textDecoration: none`, `cursor: pointer`.
- `transitionProperty: transform, opacity`, `transitionDuration: transitionSlow`.
- **Hover**: `transform: scale(1.04)`, `opacity: 0.9`.
- Destination: `/player/{encodeURIComponent(id)}`.

### Card poster (`.cardPoster`)

- `width: 120px`, `height: 68px`, `borderRadius: radiusSm`, `backgroundSize: cover`, `backgroundPosition: center top`.
- Default gradient: `linear-gradient(135deg, #1a0a0a 0%, #2d0d10 100%)`.
- Actual gradient when available: `backgroundImage: url(...)`.
- `border: 1px solid rgba(255,255,255,0.08)`, `flexShrink: 0`.

### Card title (`.cardTitle`)

- `fontSize: 11px`, `fontWeight: 600`, `color: colorText`, `lineHeight: 1.3`.
- Clamped to 2 lines via `-webkit-box`, `-webkit-line-clamp: 2`, `-webkit-box-orient: vertical`, `overflowY: hidden`.

### Card year (`.cardYear`)

- `fontSize: 10px`, `color: rgba(255,255,255,0.3)`.

### Actions (`.actions`)

- `display: flex`, `flexDirection: row`, `gap: 10px`, `alignItems: center`.
- Centering container for replay button.

### Replay button (`.replayBtn`)

- `display: inline-flex`, `alignItems: center`, `gap: 6px`, `padding: 8px 20px`.
- `backgroundColor: transparent`, `border: 1px solid rgba(255,255,255,0.18)`, `borderRadius: radiusSm`.
- `color: rgba(255,255,255,0.6)`, `fontSize: 12px`, `fontWeight: 600`, `fontFamily: inherit`, `cursor: pointer`.
- `transitionProperty: color, border-color`, `transitionDuration: transition`.
- **Hover**: `color: colorText`, `border: 1px solid rgba(255,255,255,0.35)`.

## Behaviour

### Suggestion selection

- Displays up to 4 videos from the same library, excluding the current video.
- Each card is a `<Link to="/player/{id}">` — click navigates to that film and restarts playback.
- Poster and metadata load from the video's `metadata { posterUrl, title, year }`.

### Replay

- Replay button fires `PlayRequestedEvent()` via Nova bubble.
- VideoPlayer's interceptor receives it and calls `startPlayback(resolution)`, which restarts the current video at the beginning.

### Lazy loading

- Wrapped in `<Suspense fallback={null}>` inside VideoPlayer.
- Only instantiates when `isEnded = true`, avoiding render cost during playback.
- Fallback is null (no skeleton, no placeholder — just no render until fragment data arrives).

## Data

- **Fragment**: Carries `id` and `library { videos(first: 6) { edges { node { id, title, metadata { year, posterUrl } } } } }`.
- **Derived**: Suggestions filtered to exclude current video (`v.id !== data.id`), limited to first 4.

## Notes

- **Minimal interactivity**: Intentionally simple — no form, no settings, no history. Just links and a replay button.
- **Card hover scale**: The 1.04 scale + opacity fade on hover provides feedback without distracting from the content. Smooth transition duration (`transitionSlow` from tokens) keeps movement graceful.
- **Poster gradient fallback**: Dark red-tinted gradient ensures readable placeholder when poster URL fails to load.
- **Empty end screen**: If no suggestions are available (library has only one film), the label and cards are not rendered. Only the Replay button appears. The overlay still shows to prompt intentionality (user must explicitly dismiss or replay).
- **Typography constraints**: Card titles wrap to 2 lines max; years are secondary metadata. This enforces scannable 120px card width.
- **No click-outside dismiss**: End screen persists until user navigates, replays, or goes back. Intentional friction to encourage browsing suggestions before leaving.
