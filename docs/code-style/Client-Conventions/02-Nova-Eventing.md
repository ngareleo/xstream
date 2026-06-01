# Nova Eventing

The xstream client routes all cross-component user actions through `@nova/react`. Children `bubble()` events; ancestors intercept with `NovaEventingInterceptor`. **Callback props are not used for event-driven flow.** This doc is the canonical place for the rule, the rationale, the decision tree, and the exceptions.

## The rule

> **Components and hooks never accept callback props for cross-component signals. They emit Nova events instead.** Data-flow props (fragment keys, primitive values like `resolution` / `status`, controlled-input `value`) stay as plain props.

If you find yourself writing `interface Props { onX: (...) => void }` on a project-defined component or hook, the default answer is: don't. Bubble an event.

## Why — reference stability + zero memo overhead

A callback prop's identity changes on every render of its owner. When a parent does:

```tsx
<Child onSelect={(id) => setSelected(id)} />
```

…React allocates a fresh `(id) => setSelected(id)` function on every parent render. That fresh identity:

- Invalidates `React.memo(Child)`.
- Re-runs every `useEffect([onSelect])` and `useCallback([onSelect])` inside `Child`.
- Forces consumers further down to wrap-and-rewrap with `useCallback` purely to keep identity stable, which spreads the problem rather than solving it.

Nova's eventing bus is rooted at the app — `client/src/main.tsx` mounts a single `NovaEventingProvider`. `bubble()` is a stable reference. Children that bubble don't take a function from a parent at all, so the parent's render cycle stops contaminating the child's effect graph.

**A second benefit:** because Nova guarantees the reference stability you need, you stop reaching for `useCallback` to paper over identity churn. Interceptors don't have to be memoized — when their identity changes between renders, Nova still invokes them with fresh closure state and does not trigger any re-render of the bubbling subscriber. The `useCallback` cache lookups that callback-prop trees force on you (and the hook dependency-array audits, and the cascading memoization down the subtree) all evaporate. *Less* React infrastructure, not more.

The cost of getting this wrong is not a single bug — it's a class of subtle re-render and effect-loop issues that surface only when a parent rerenders frequently (subscriptions, animations, polling), plus the cumulative bookkeeping cost of `useCallback`/`useMemo` everywhere you'd otherwise need it. The rule exists to keep the prop graph free of identity hazards and the component free of memoization scaffolding.

## Decision tree

For every prop you're tempted to type as `() => void` or `(arg) => void`:

1. **Is this a data-flow value the child reads to render itself?** (`fragment$key`, `resolution`, `status`, controlled-input `value`.) → plain prop.
2. **Is this a native intrinsic handler on a wrapped HTML element with no upward signal?** (`onClick` on a `<button>` whose effect is purely local: toggling internal state, focusing a ref, etc.) → plain prop. Inline DOM handlers are fine; what's banned is exposing them as part of the component's public API to drive cross-component behaviour.
3. **Is this a form-input-shaped `onChange` mirroring native HTML semantics?** (See "Exceptions" below.) → plain prop, codified exception.
4. **Is this notifying a parent or sibling of a user action, lifecycle change, selection, or async result?** → **Nova event.**
5. **Is this a third-party library callback (Relay `useMutation`, React Router `useNavigate`)?** → keep the library API; the rule does not apply at library boundaries.

## Event taxonomy — group by domain, not by component

The default first instinct is to colocate every events file with its component (`AppHeader.events.ts`). That works fine when one component owns the event end-to-end. It scales badly when:

- The same logical event has multiple emitters (an episode can be picked from `PlayerSidebar`, `SeasonsPanel`, or a future deep-link).
- The event describes a cross-cutting concern (job lifecycle, telemetry, navigation) that doesn't belong to a single component.
- A consumer would otherwise have to listen to N originators for one logical signal.

**Pick the originator by the *domain* the event represents, not the file that emits it.**

| Originator style | When to use | Lives at |
|---|---|---|
| **Domain noun** (`"playback"`, `"overlay"`, `"profiles"`, `"search"`, `"detailPane"`, `"error"`, `"toast"`) | Event has multiple emitters, or describes cross-cutting infrastructure (hooks bubbling job state, telemetry signals). | `client/src/events/<domain>.events.ts` |
| **Component name** (`"AppHeader"`, `"AccountMenu"`, `"DirectoryBrowser"`) | Single emitter, single consumer, narrow scope. The component "owns" the event. | colocated `client/src/components/<kebab>/<Component>.events.ts` |

**`"toast"` domain example.** `client/src/events/toast.events.ts` defines originator `"toast"`, event type `"Requested"`, payload `{ variant, message }`. Any component or hook that needs to surface a toast calls `useToast()` → `showToast({ variant, message })`, which emits a `ToastRequestedPayload` event. `ToastProvider` (mounted in `AppShell`) intercepts it, appends to the stack, and auto-dismisses. Because multiple callers emit the same logical signal (re-link success, scan error, any future caller), the domain originator pattern is correct here — a component-scoped events file would require `ToastProvider` to listen to N different originators.

**Heuristic.** Before defining an event, ask: *"If a second emitter ever bubbled this same logical signal, would I want consumers to handle two originators or one?"* One → use a domain originator. The taxonomy collapses to component-only when the event truly cannot have a second emitter.

**Naming.**
- Domain originators are camelCase nouns: `"playback"`, not `"Playback"` and not `"PlaybackDomain"`.
- Component originators stay PascalCase to match component file names: `"AppHeader"`, `"AccountMenu"`.
- Event types within a domain are PascalCase verbs in the past or progressive tense describing what happened: `"EpisodeSelected"`, `"FilmDetailsClosed"`, `"FilterOpenRequested"`.
- Type guards are named `isXxxEvent(wrapper)`; factories are `createXxxEvent(payload)`.

## Pattern

Events file (domain or colocated, the shape is identical):

```ts
import type { EventWrapper, NovaEvent } from "@nova/types";

export const PLAYBACK_ORIGINATOR = "playback";

export const PlaybackEventTypes = {
  EPISODE_SELECTED: "EpisodeSelected",
  PLAY_STATUS_CHANGED: "PlayStatusChanged",
} as const;

export interface EpisodeSelectedPayload {
  seasonNumber: number;
  episodeNumber: number;
}

export function createEpisodeSelectedEvent(
  payload: EpisodeSelectedPayload,
): NovaEvent<EpisodeSelectedPayload> {
  return {
    originator: PLAYBACK_ORIGINATOR,
    type: PlaybackEventTypes.EPISODE_SELECTED,
    data: () => payload,
  };
}

export function isPlaybackEvent(wrapper: EventWrapper): boolean {
  return wrapper.event.originator === PLAYBACK_ORIGINATOR;
}

export function isEpisodeSelectedEvent(wrapper: EventWrapper): boolean {
  return (
    wrapper.event.originator === PLAYBACK_ORIGINATOR &&
    wrapper.event.type === PlaybackEventTypes.EPISODE_SELECTED
  );
}
```

Emitter:

```tsx
const { bubble } = useNovaEventing();
// inside a click handler:
bubble(createEpisodeSelectedEvent({ seasonNumber, episodeNumber }));
```

Interceptor (in the parent that handles the event):

```tsx
const interceptor = async (wrapper: EventWrapper) => {
  if (isEpisodeSelectedEvent(wrapper)) {
    const { seasonNumber, episodeNumber } = wrapper.event.data() as EpisodeSelectedPayload;
    setSelectedEpisode(seasonNumber, episodeNumber);
  }
  return wrapper; // always forward unless forwarding causes an unwanted side effect
};

return (
  <NovaEventingInterceptor interceptor={interceptor}>
    {children}
  </NovaEventingInterceptor>
);
```

**No `useCallback` needed.** Nova guarantees reference stability of its bus internally — when the interceptor identity changes between renders, eventing still calls it with fresh closure state and does **not** cause a re-render of the subscriber side. The `useCallback` cache overhead that callback-prop patterns force on you is exactly one of the costs Nova eliminates. Write the interceptor inline; don't memoize it.

## Storybook

Stories for components that call `useNovaEventing()` must add `withNovaEventing` from `client/src/storybook/withNovaEventing.tsx` to `meta.decorators`. Never inline a manual `NovaEventingProvider` in a story file — the decorator wires the no-op provider consistently and matches what production renders.

To assert that a component bubbled an event, configure the decorator's spy and use a `play` function:

```tsx
import { withNovaEventing } from "~/storybook/withNovaEventing";

const meta = {
  decorators: [withNovaEventing()],
  // …
};
```

## Exceptions

Codified — these are *not* violations:

1. **Form-input-shaped `onChange` / `onClick` on inputs that mirror native HTML semantics.** `SettingsToggle.onChange`, `SettingsSelector.onClick`, `TuiToggle.onClick`, `NumberInput.onChange`. These are *controlled-input* APIs whose contract is "give me your current value when it changes," matching `<input>`/`<select>`. Treat them as data-flow props, not events.
2. **Native intrinsic handlers on raw HTML elements** inside a single component: `<button onClick={...}>` is fine when the click only flips internal state.
3. **Third-party library callbacks** at library boundaries: Relay's `useMutation({ onCompleted, onError })`, React Router's `useNavigate`, `IntersectionObserver` callbacks, etc. The rule does not apply where the callback shape is the library's contract.
4. **Single-use inline closures that exist only to satisfy a callback signature** (e.g. a `setTimeout` cleanup) — these never travel up the prop graph, so the reference-stability concern doesn't apply.
5. **The root `ErrorBoundary` and the `ErrorPage` it renders.** `ErrorBoundary` wraps the entire app *above* `NovaEventingProvider` in `client/src/main.tsx` so it can catch errors thrown by the provider itself; calling `useNovaEventing()` from within would throw. `onRetry` is the documented carve-out. If a future error UI lives strictly below the provider, it should still use Nova.

If you think you have a fifth exception, it probably means the event taxonomy needs a new domain. Discuss before introducing a new exception class.

## Where this rule is enforced in agent instructions

- [`../Anti-Patterns/00-What-Not-To-Do.md`](../Anti-Patterns/00-What-Not-To-Do.md) — hard rule line.
- [`../Invariants/00-Never-Violate.md`](../Invariants/00-Never-Violate.md) — implicit via the anti-patterns reference; this doc is the canonical home.
- `.claude/skills/write-component/SKILL.md` — the "Nova eventing" section links here.
- `.claude/skills/implement-design/SKILL.md` — "Event handling" section links here. Design-lab JSX often shows callback props; do not copy them verbatim.
- `CLAUDE.md` — "Where to read" routing pointer.
