# ErrorBoundary

Class component that catches unhandled render errors and displays a recovery
screen. Dual-mode: development shows full stack traces and debugging tools;
production shows a clean error page with retry and navigation options.

**Source:** `client/src/components/error-boundary/`
**Mounted:** Top level in `main.tsx` wrapping the entire app.

## Role

Last-resort error handler for the app. Logs errors via telemetry and renders
either a dev error screen or production ErrorPage based on `NODE_ENV`.

## Props

| Prop | Type | Notes |
|---|---|---|
| `children` | `ReactNode` | Protected component tree. |

## Behaviour

### Error capture

- `getDerivedStateFromError()` catches any render error and sets `hasError: true`.
- `componentDidCatch()` logs the error via `getClientLogger("errorBoundary")` with `error_name`, `message`, `component_stack`.
- `handleReset()` clears state and calls `window.__devToolsReset?.()` before re-mounting children.

### Development rendering

- Shows `DevErrorScreen` component with:
  - **Full stacks** — JavaScript + React component stack in scrollable code blocks.
  - **Copy button** — copies combined stack trace to clipboard.
  - **Preview button** — toggles "customer view" to show what prod would render.
  - **Try again** — calls `handleReset()` to re-mount children.
  - **Reload page** — full browser refresh.
- Error name displayed prominently at the top.

### Production rendering

- Shows `ErrorPage` component (from `pages/error-page/`).
- Optional component stack in collapsed details.
- Back link ("← Back to library") and Retry CTA.
- Red-bordered identity design (M9 spec).

## Data

- Logs error details to telemetry.
- State: `{ hasError, error, errorInfo }`.

## Notes

- Class component (not hooks-based) because React requires class boundaries for error catching.
- `handleReset()` calls `window.__devToolsReset()` to coordinate with DevTools before clearing state.
- Production build shows clean UI; dev build exposes all diagnostics for debugging.
- The component recovers on retry by resetting state and re-rendering children.
