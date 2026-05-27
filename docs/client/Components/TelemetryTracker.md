# TelemetryTracker

Null-rendering telemetry observer component mounted once at the router root. Tracks user activity (clicks, keyboard, mouse movement), page route changes, and page load metrics. Emits `page.visit` logs, `page.visits` counter increments, and `page.load_time_ms` histograms to instrument client usage at the session level.

## Role

`TelemetryTracker` is an invisible component that bridges raw browser activity and route changes into the telemetry pipeline:

- **Activity tracking** — listens to click, keydown (capture phase) and mousemove, scroll (passive phase) to detect user activity; feeds into the user-session state machine via `noteActivity()` to keep the idle timer alive during active use
- **Route observation** — captures every route change (both cold-load and in-app transitions) and emits a `page.visit` log with the route template, load time (if cold-load), and a `page.visits` counter increment
- **Page load metrics** — uses the PerformanceNavigationTiming API on cold-load and a double-rAF measurement on route transitions to capture load time; emits a `page.load_time_ms` histogram with attributes `route` (template) and `kind` (cold_load vs transition)

No UI, no props, no children — just mount once and let it observe.

## Props

```ts
interface TelemetryTrackerProps {
  // None — this is a fire-and-forget observer
}
```

## Layout & styles

Renders `null`. No DOM footprint.

## Behaviour

### Initialization

On mount, TelemetryTracker:
1. Calls `initUserSession(hooks)` to initialize the user-session state machine if not already initialized
2. Calls `startSessionTelemetry()` to wire session start/end hooks to telemetry (emits "Session started" log on start, "Session ended" log + `user.session.duration_ms` histogram on end)
3. Sets up activity listeners (click, keydown, mousemove, scroll)
4. Captures the current route via `useLocation()` and registers a route change listener

### Activity listeners

- **Click capture phase** — `document.addEventListener('click', handler, { capture: true })`. Calls `noteActivity()` on every click anywhere in the document.
- **Keydown capture phase** — same pattern. Calls `noteActivity()` on every key press.
- **Mousemove passive phase** — `addEventListener('mousemove', handler, { passive: true })`. Calls `noteActivity()` (could debounce to avoid noise, but simple implementation is fine for now).
- **Scroll passive phase** — `addEventListener('scroll', handler, { passive: true })`. Calls `noteActivity()` on scrolling.

All listeners are registered on mount and cleaned up on unmount.

### Route tracking

On mount, capture the initial route via `useLocation()`. Register a change listener that fires on every route change (both initial cold-load and React Router transitions). For each route:

1. **Cold-load detection** — Check if `performance.getEntriesByType('navigation')[0]?.type === 'navigate'` to detect hard page loads. If this is the first route after mount and it's a navigate, measure load time using `PerformanceNavigationTiming.loadEventEnd - PerformanceNavigationTiming.fetchStart` (or `domInteractive - fetchStart` if `loadEventEnd` is 0). This captures the full navigation, script parsing, and initial render. Emit a `page.visit` log with `load_time_ms = <measurement>` and `is_first_load = true`.

2. **In-app transition detection** — If the route changes and we're already mounted (not the initial load), use a double-rAF measurement: measure wall-clock time between the route change and the second `requestAnimationFrame` callback (rAF 1 captures the render, rAF 2 captures the paint). This is a coarse estimate of "time until the new route is visually ready." Emit a `page.visit` log with `load_time_ms = <measurement>` and `is_first_load = false` (or omit the field if it's always present).

3. **Route template** — Convert the pathname to a low-cardinality template using `routeTemplate()` helper (e.g. `/player/<id>` → `/player/:videoId`, `/settings` → `/settings`, etc.). Emit the template, not the raw path.

4. **Logs and metrics** — Emit `page.visit` log + `page.visits` counter + `page.load_time_ms` histogram.

### Example flow

```
1. User loads xstream in browser
   → TelemetryTracker mount detects pathname `/` (Library page)
   → Cold-load: PerformanceNavigationTiming.loadEventEnd ≈ 2340ms
   → Emits: log "page.visit" route=/  is_first_load=true load_time_ms=2340
   → Increments: counter page.visits { route = "/" }
   → Records: histogram page.load_time_ms value=2340, attrs { route="/", kind="cold_load" }

2. User clicks on a film, React Router navigates to /player/:videoId
   → Route change listener fires
   → Measures double-rAF: 45ms from route change to paint
   → Emits: log "page.visit" route=/player/:videoId is_first_load=false load_time_ms=45
   → Increments: counter page.visits { route="/player/:videoId" }
   → Records: histogram page.load_time_ms value=45, attrs { route="/player/:videoId", kind="transition" }
```

## Data sources

- `useLocation()` from React Router to track route changes
- `performance` API to measure load times
- Session state machine (`noteActivity()`, `startSessionTelemetry()`) from `services/userSession.ts` and `services/sessionTelemetry.ts`

## Used by

- Mounted once in `router.tsx` inside a pathless `RootLayout` component that wraps all routes, so TelemetryTracker observes every page including unauthenticated auth pages

## Observability

- Log: `page.visit` — emitted on every route change with `route`, `is_first_load`, `load_time_ms`
- Counter: `page.visits` — incremented on every route change, attr `route` (low-cardinality template)
- Histogram: `page.load_time_ms` — recorded on every route change, attrs `route` and `kind` (cold_load / transition)
- These metrics let operators track session journeys, bounce rates, and page-load performance

## Outstanding work

- Route template mapping might need refinement if new dynamic routes are added (currently handles `/player/:videoId`, `/profiles/:profileId`, etc.)
- Double-rAF measurement could be improved with more sophisticated timing (e.g. First Contentful Paint from PerformanceObserver), but the simple approach is good for MVP
- Activity listeners could be debounced to reduce noise (one `noteActivity()` per 100ms instead of on every event)
