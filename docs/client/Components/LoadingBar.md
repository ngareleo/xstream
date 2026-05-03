# LoadingBar

Fixed top-of-viewport progress bar with animated fill and shimmer effect. Driven
by `LoadingBarContext`, which aggregates loading states from all registered page
loaders and router navigation events. Renders nothing when idle.

**Source:** `client/src/components/loading-bar/`
**Used by:** Mounted once in `AppShell` and fed by `RouterNavigationLoader`.

## Role

Global progress indicator for page navigation and async operations. Uses a three-phase
state machine (idle, loading, completing) to show fill progress, a trailing spark,
and a sweeping sheen highlight.

## Layout & styles

### Root container

- `position: fixed`, `top: 0`, `left: 0`, `right: 0`, `height: 3px`.
- `zIndex: 9990`, `pointerEvents: none`, `overflow: visible`.

### Track

- `position: absolute`, `inset: 0`, `transformOrigin: left center`.
- `background: #CE1126`, `boxShadow: 0 0 6px 1px rgba(206,17,38,0.7), 0 0 16px 2px rgba(206,17,38,0.35)`.

### Loading animation

- Keyframes: `scaleX(0 → 0.28 → 0.50 → 0.66 → 0.76 → 0.82 → 0.88)` over 12%, 30%, 52%, 72%, 88%, 100% of timeline.
- Duration: `2.4s`, `cubic-bezier(0.05, 0, 0.02, 1)` (heavy easing to slow near 88%).

### Completing animation (exit)

- Keyframes: `scaleX(0.88 → 1)` at 45%, then fade `opacity(1 → 0)` at 65%–100%.
- Duration: `0.65s` ease.

### Sheen highlight

- `position: absolute`, `inset: 0`.
- Gradient: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.30) 40%, rgba(255,255,255,0.55) 50%, rgba(255,255,255,0.30) 60%, transparent 100%)`.
- `backgroundSize: 60px 100%`, `backgroundRepeat: no-repeat`.
- Sweeping animation: `backgroundPosition: -60px 0 → 200% 0` over `1.1s linear infinite`.

### Spark

- `position: absolute`, `right: 0`, `top: 50%`, `transform: translateY(-50%)`.
- `width: 5px`, `height: 5px`, `borderRadius: 50%`.
- `background: #ff8899`, `boxShadow: 0 0 4px 2px rgba(255,80,100,0.9), 0 0 10px 4px rgba(206,17,38,0.6), 0 0 20px 6px rgba(206,17,38,0.25)`.
- Pulsing animation: `opacity(0.8 → 1)`, `scale(1 → 1.4)` over `0.7s ease-in-out` alternating.

## Behaviour

Phase state machine (updated by `useEffect` watching `isLoading`):

- **idle** → **loading**: when `isLoading` becomes true. Bar animates 0 → 88% over 2.4s.
- **loading** → **completing**: when `isLoading` becomes false. Bar snaps to 100%, then fades out over 650ms.
- **completing** → **idle**: after completing animation finishes, reset and unmount.

When `phase === "idle"`, component returns `null` (nothing rendered).

## Data

Driven by `useLoadingBarState()` which reads the aggregated boolean from `LoadingBarContext`:

- `LoadingBarProvider` maintains a map of `id → boolean` for each loader.
- `isLoading` is true if any loader is true.
- `usePageLoading(boolean)` registers/unregisters a loader on mount/unmount.

## Context API

- **LoadingBarProvider** — wraps the app tree (mounted in AppShell).
- **usePageLoading(loading: boolean)** — call at the top of any page component to signal loading state.
- **useLoadingBarState()** — internal hook to read the bar's visibility state.

## Notes

- The bar never shows 100% during loading; it stops at ~88% to indicate ongoing work.
- The completing animation provides visual confirmation of success without jarring disappearance.
- The spark and sheen are pure decoration and run independently of the fill progress.
- Fires every time any loader changes, not on a timer; multiple fast loaders produce a continuous bar.
