# RouterNavigationLoader

Bridge component that connects React Router navigation state to the global
`LoadingBar`. Renders nothing but manages the loading bar's visibility during
route transitions.

**Source:** `client/src/components/router-navigation-loader/`
**Mounted:** Once inside `AppShell`, nested inside `LoadingBarProvider`.

## Role

Synchronizes two signals into the loading bar:

1. **Route data loaders** — when `navigation.state === "loading"`, a loader is running.
2. **Route navigation commits** — when `location.key` changes, the route has changed (including lazy routes with no loaders).

## Behaviour

- Watches `useNavigation().state` from React Router.
  - If `state === "loading"`, signal the bar to show.
- Watches `useLocation().key` for changes.
  - When the key changes, the route committed. Signal the bar to show briefly (60ms) for the enter animation, then let it run its completing animation (~650ms total).
- Calls `usePageLoading(boolean)` with the combined signal (`state === "loading" || transitioning`).

### State machine

- **prevKeyRef** — stores the last location key to detect navigation.
- **transitioning** — local state flag that fires on key change, stays true for 60ms, then clears.
- Combined signal: `state === "loading" || transitioning`.

## Data

No data fetching; reads from React Router's navigation context.

## Notes

- Returns `null` — renders nothing visually.
- The 60ms brief signal is timed to allow LoadingBar's enter animation to mount before letting the bar exit.
- Works for both data loader routes and lazy-loaded routes (which don't trigger loaders).
- Must be mounted inside LoadingBarProvider to work (AppShell does this).
