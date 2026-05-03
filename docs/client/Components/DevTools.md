# DevTools

Development-only floating panel and context provider for forcing component
render errors. Only rendered when `process.env.NODE_ENV !== "production"`.
Exports a no-op stub in production builds.

**Source:** `client/src/components/dev-tools/`
**Mounted in:** `AppShell` via `DevPanelAsync` (code-split).

## Role

Error injection tooling for testing ErrorBoundary recovery flows. Allows devs
to trigger render throws inside any registered `<DevThrowTarget id="...">` from
a floating DEV pill in the corner.

## Components

### DevToolsProvider (context)

- Wraps the app in `AppShell`; manages `throwTarget` state.
- Provides `window.__devToolsReset()` hook for ErrorBoundary to call before resetting.
- **useDevTools()** hook — returns `{ throwTarget: string | null, setThrowTarget(id: string | null): void }`.

### DevPanelInner (inner component)

- Renders a fixed DEV pill in the bottom-right corner.
- Toggle with pill click; close with ESC or click-outside.
- **Popup menu** — lists all registered throw targets (Dashboard, Library, Player, NotFound).
- Each target has a label and an ID reference.
- **Throw button** — force-throws a descriptive error inside the matching `DevThrowTarget`.

### DevPanelAsync (code-split wrapper)

- Dynamically imports `DevPanelInner` for code-splitting.
- Returns null in production.

## Layout & styles

- **DEV pill** — `position: fixed`, `bottom-right` corner, small button with green text.
- **Active pill** — border or background change on toggle.
- **Popup** — dark overlay, header with route, list of targets, footer explaining ErrorBoundary.
- All styles defined in `DevPanel.styles.ts`.

## Behaviour

- On mount (dev only): no-op in production builds.
- Click DEV pill to toggle popup visibility.
- Press ESC to close.
- Click outside the popup to close.
- Click "Throw" button for a target: closes popup, then after 50ms calls `setThrowTarget(id)`.
- `DevThrowTarget` component checks if its `id` matches `throwTarget` and throws if true.
- ErrorBoundary catches the throw and calls `window.__devToolsReset()` to clear the state before retrying.

## Notes

- No visible effect in production; the entire feature tree is dead code.
- Throw targets must be manually added to the THROW_TARGETS constant when wrapping new pages.
- Error message includes the target ID for easy debugging.
