# Debugging Playbooks

Client-side + GraphQL debugging recipes. Backend/ffmpeg/HW-accel playbooks live with the `devops` subagent; invoke that agent for zombie ffmpeg, VAAPI driver gaps, OMDb auto-match, and dev-server port triage.

---

## GraphQL subscriptions not receiving events

Symptoms: `onNext` is never called; UI doesn't refresh after a scan; no subscription messages in Network → WS.

**Check 1 — Rsbuild proxy forwards WebSocket upgrades.** In `client/rsbuild.config.ts`, `/graphql` proxy needs `ws: true`:
```ts
proxy: { "/graphql": { target: "http://localhost:3001", ws: true } }
```
Without it, Rsbuild intercepts the upgrade and returns HTTP 200, silently killing the connection.

**Check 2 — `Bun.serve` has a WebSocket upgrade handler.** `server/src/index.ts` must explicitly upgrade WebSocket requests and pass a `websocket` key to `Bun.serve`:
```ts
import { handleProtocols, makeHandler as makeWsHandler } from "graphql-ws/lib/use/bun";
import { schema } from "./routes/graphql.js";

if (url.pathname === "/graphql" && req.headers.get("upgrade") === "websocket") {
  const protocol = req.headers.get("sec-websocket-protocol") ?? "";
  if (!handleProtocols(protocol)) return new Response("Bad Request", { status: 400 });
  if (!server.upgrade(req)) return new Response("WebSocket upgrade failed", { status: 500 });
  return new Response();
}
// in Bun.serve options:
websocket: makeWsHandler({ schema }),
```

**Check 3 — Verify in DevTools.** Network → WS → `/graphql` → Messages. `{"type":"connection_ack"}` should appear within 1s. Status 200 instead of 101 means the upgrade handler is missing.

**Check 4 — Subscription config is stable.** The `useMemo` wrapping the subscription config must have an empty or stable dep array. Fresh objects on every render cause constant resubscription.

---

## UI not refreshing after a scan completes

Symptoms: scan runs, ends, but library/dashboard data doesn't update.

The `wasScanning` ref chain is:
```
scanning=true  → wasScanning.current = true
scanning=false → wasScanning.current && !isScanning → setFetchKey(k+1)
fetchKey change → useLazyLoadQuery re-fetches with network-only
```

Broken links:
1. WebSocket not connected → see playbook above.
2. `wasScanning.current` never set to `true` → add a `console.log` in `onNext` to confirm events arrive.
3. `fetchKey` not passed to `useLazyLoadQuery` → verify:
   ```ts
   useLazyLoadQuery(QUERY, vars, { fetchKey, fetchPolicy: fetchKey > 0 ? "network-only" : "store-or-network" })
   ```

---

## Resolver ordering conflict (field returns wrong value)

Symptoms: a field like `Video.matched` always returns `false`/`null` even when data exists.

Root cause: `@graphql-tools/schema`'s `makeExecutableSchema` merges resolvers by `Object.assign` — duplicate `Type.field` entries: **last one wins**. Check merge order in `server/src/routes/graphql.ts`.

Fix: each GraphQL type has one authoritative resolver file:
- `Video.*` → `resolvers/video.ts`
- `Library.*` → `resolvers/library.ts`
- `TranscodeJob.*` → `resolvers/job.ts`
- Root fields → `resolvers/query.ts`, `mutation.ts`, `subscription.ts`

Find conflicts: `grep -r "matched:" server/src/graphql/resolvers/`.

---

## Effect cleanup: intervals with nested timeouts

Symptoms: React warns "Can't perform a state update on an unmounted component"; state changes fire after unmount.

When a `setInterval` callback schedules a `setTimeout` (e.g. slide fade in `Slideshow`), cleanup must cancel **both**:
```ts
useEffect(() => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const intervalId = setInterval(() => {
    timeoutId = setTimeout(() => { /* ... */ }, FADE_DURATION);
  }, SLIDE_INTERVAL);
  return () => {
    clearInterval(intervalId);
    if (timeoutId !== null) clearTimeout(timeoutId);
  };
}, [deps]);
```

Clearing only the interval lets an in-flight timeout fire after unmount and call `setState` on a dead component.

---

## Relay "preloaded query was disposed" warning

Symptoms: switching between detail items (film A → film B) triggers the disposed-preloaded-query warning.

Root cause: `usePreloadedQuery` holds a query ref. When `loadQuery` is called again, the old ref is disposed. If the consuming component hasn't remounted, it reads a disposed ref.

Fix: add `key={selectedId}` to force remount on each new item:
```tsx
{queryRef && (
  <Suspense fallback={null}>
    <FilmDetailLoader key={filmId} queryRef={queryRef} linking={linkingParam} />
  </Suspense>
)}
```

---

## React state persisting across React Router navigation

Symptoms: navigating between routes with the same pattern (e.g. `/player/:id → /player/:otherId`) leaves stale state — an "ended" overlay shows on the new video, or a pane shows data from the previous item.

Root cause: React Router v6 reuses the component instance when only the param changes. `useState` values are not reset; only props change.

Fix (lightweight state): reset in a `useEffect` keyed on the changing identifier:
```tsx
useEffect(() => { setIsEnded(false); }, [data.id]);
```

Fix (refs, subscriptions, MSE pipelines): force a full remount via `key`:
```tsx
<VideoPlayer key={videoId} video={data} />
```

Detection: navigate between two items in Playwright, trigger per-item state on A, switch to B, verify B starts clean.

---

## Griffel style property type errors

Symptoms: `Type '"rgba(...)"' is not assignable to type 'undefined'` or `Object literal may only specify known properties` inside `makeStyles()`.

Causes:

1. **Shorthand/longhand mismatch in pseudo-selectors.** Inside `:hover`, `:focus`, etc., repeat the same form the base rule uses:
   ```ts
   // Wrong — borderColor when base uses `border` shorthand
   ":hover": { borderColor: "rgba(255,255,255,0.35)" }
   // Correct — full shorthand
   ":hover": { border: "1px solid rgba(255,255,255,0.35)" }
   ```

2. **Non-Griffel property names.** Use React camelCase (`backgroundColor`, `WebkitLineClamp`), not `background-color` / `-webkit-line-clamp`.

3. **`animationName` must be a keyframe object, not a string:**
   ```ts
   animationName: { to: { transform: "rotate(360deg)" } }  // correct
   animationName: "spin"                                    // wrong
   ```

When a pseudo-selector property errors, check the base rule — TypeScript reports `undefined` but the real cause is property-name mismatch.

---

## `useCallback`/`useEffect` ordering: hook used before declared

Symptoms: TS error `Block-scoped variable 'X' used before its declaration` on a `useEffect` referencing a `useCallback` declared later.

Root cause: `const` declarations are hoisted but not initialised (temporal dead zone). A `useEffect` closing over a later-declared `useCallback` fails at both compile and runtime.

Natural order to keep:
1. `useFragment`
2. `useState`
3. `useRef`
4. `useCallback` — in dependency order (callbacks used by others first)
5. `useEffect` — after all callbacks they reference

When an effect and a callback have a circular dependency, extract the shared logic into a plain function called by both.

---

## Stream log overlay disappears after navigating to the player

Symptoms: stream log overlay was visible on dashboard/library, but after clicking through to `/player/:id` it's gone and no logs appear during playback.

Root cause: `DevToolsContext` holds `streamingLogsOpen` at the app root and resets on navigations that remount the context subtree. The toggle is ephemeral UI state — not persisted.

Fix for manual/e2e testing: after navigating to the player, reopen the DEV pill (bottom-right) and re-enable **"Stream Logs ON"** before starting playback.

Fix if persistence is needed: persist `streamingLogsOpen` to `localStorage` inside `DevToolsContext` (key `"devtools.streamingLogsOpen"`) — read on mount, write in a `useEffect`.
