# DevThrowTarget

Wrapper component that force-throws a render error when signalled by the
DevPanel. Used to test ErrorBoundary recovery without manually constructing
errors in component code.

**Source:** `client/src/components/dev-throw-target/`
**Mounted:** Wrap any component subtree with `<DevThrowTarget id="...">`.

## Role

Error injection point. Checks `useDevTools().throwTarget` on render and throws
a descriptive error if the target matches.

## Props

| Prop | Type | Notes |
|---|---|---|
| `id` | `string` | Identifier matching a target in DevPanel's throw menu (e.g., "Dashboard", "Player"). |
| `children` | `ReactNode` | Wrapped component tree. |

## Behaviour

- On render, if `throwTarget === id`, throw a descriptive error that includes the target ID.
- Error message: `[DevTools] Force-thrown in: {id}\n\nThis error was triggered by the DevPanel kill switch. It simulates a render crash in the "{id}" component tree.`
- Otherwise, render children unchanged (passthrough).

## Notes

- Development-only utility; no overhead in production.
- Must be co-located with a corresponding entry in DevPanel's THROW_TARGETS list.
- Simulates crashes at the component tree level, not deep in leaf state. Useful for testing ErrorBoundary's ability to isolate failures.
