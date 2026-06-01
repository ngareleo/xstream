# Toast

Reusable notification system. A Nova-event-driven `ToastProvider` intercepts `"toast" / "Requested"` events from anywhere in the subtree and renders a stacked auto-dismissing viewport. Any component or hook calls `useToast()` to show a toast; no prop drilling required.

**Source:** `client/src/components/toast/`
**Used by:** `AppShell` (mounts `ToastProvider`).

## Role

Cross-cutting notification surface for brief, non-blocking feedback (e.g. "Re-linked to Oppenheimer", "Scan complete"). Decoupled from any specific caller via the Nova eventing bus. `ToastProvider` is a single interceptor that aggregates all toast requests into one rendered viewport.

## Files

| File | Purpose |
|---|---|
| `Toast.tsx` | `ToastProvider` component (interceptor + viewport) |
| `Toast.styles.ts` | Griffel styles |
| `Toast.strings.ts` | Any localised strings (currently empty / `auto-dismiss` countdown only) |
| `Toast.stories.tsx` | Storybook stories asserting `Requested` event dispatch and auto-dismiss timing |

## Nova event domain

`client/src/events/toast.events.ts`:

- **Originator:** `"toast"`
- **Event type:** `"Requested"`
- **Payload:** `ToastRequestedPayload { variant: "success" | "error" | "info", message: string }`

Domain originator chosen over component-scoped originator because multiple callers emit this signal (re-link success in `DetailPaneEdit`, potential future callers). `ToastProvider` only needs to listen on one originator. See [`docs/code-style/Client-Conventions/02-Nova-Eventing.md`](../../code-style/Client-Conventions/02-Nova-Eventing.md) §"toast domain example".

## Emitter hook

`client/src/hooks/useToast.ts`:

```ts
const { showToast } = useToast();
showToast({ variant: "success", message: "Linked to Oppenheimer (2023)" });
```

Uses Nova `generateEvent` (the non-React-SyntheticEvent path) — safe to call from async mutation callbacks where a synthetic event is not available.

## Layout & styles

### Viewport (`.viewport`)

- `position: fixed`, `bottom: 24px`, `right: 24px`, `zIndex: 9999`.
- `display: flex`, `flexDirection: column`, `rowGap: 8px`, `alignItems: flex-end`.
- `pointerEvents: none` on the viewport itself; individual toasts re-enable pointer events.

### Toast card (`.toast`)

- `maxWidth: 360px`, `padding: 12px 16px`, `borderRadius: 6px`, `pointerEvents: auto`.
- `fontFamily: fontMono`, `fontSize: 11px`, `letterSpacing: 0.1em`.
- `backdropFilter: blur(12px)`, `backgroundColor: rgba(5,7,6,0.82)`, `border: 1px solid colorBorder`.
- **`success` variant:** `borderLeftColor: colorGreen`, `color: colorText`.
- **`error` variant:** `borderLeftColor: colorRed`, `color: colorText`.
- **`info` variant:** `borderLeftColor: colorBorder`, `color: colorTextDim`.
- Enter/exit animation: slide-in from bottom-right + fade-in over 180ms; fade-out over 120ms.

## Behaviour

### ToastProvider (interceptor)

- Wraps subtree in `<NovaEventingInterceptor interceptor={interceptor}>`.
- On `isToastRequestedEvent(wrapper)`:
  - Appends `{ id: uuid(), variant, message, visible: true }` to internal stack (max 5 visible at once; oldest dismissed when limit exceeded).
  - Schedules `setTimeout` to set `visible: false` after **3000ms** (auto-dismiss). On unmount, `clearTimeout` for all pending timers.
  - Always forwards the event (`return wrapper`).
- Renders the stacked viewport with one card per visible entry.

### Auto-dismiss

- 3 s default. The timer is per-toast, not global.
- On exit, the toast fades out (120ms) then is removed from state.

### Manual dismiss

- Each toast card has a small close button (top-right, `<IconClose 10×10>`). Click: cancels the timer and immediately starts fade-out.

## Data

No Relay fragment. Pure event-driven — no GraphQL data.

## Notes

- Stories use `withNovaEventing` decorator and assert that clicking a trigger emits a `"toast" / "Requested"` event; a second assertion confirms auto-dismiss fires after 3 s (Storybook fake-timers pattern from `01-Storybook-Testing.md`).
- `useToast` uses `generateEvent` (not `bubble`) because it is called from async callbacks where a React synthetic event context is not available.
