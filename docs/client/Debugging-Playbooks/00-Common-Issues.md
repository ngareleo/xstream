# Debugging Playbooks

Client-side + GraphQL debugging recipes. Backend/ffmpeg/HW-accel playbooks live with the `devops` subagent; invoke that agent for zombie ffmpeg, VAAPI driver gaps, OMDb auto-match, and dev-server port triage.

---

## GraphQL subscriptions not receiving events

Symptoms: `onNext` is never called; UI doesn't refresh after a scan; no subscription messages in Network → WS.

**Check 1 — Rsbuild proxy forwards WebSocket upgrades.** In `client/rsbuild.config.ts`, `/graphql` proxy needs `ws: true`:
```ts
proxy: { "/graphql": { target: "http://localhost:3002", ws: true } }
```
Without it, Rsbuild intercepts the upgrade and returns HTTP 200, silently killing the connection.

**Check 2 — Server has a WebSocket upgrade handler.** The Rust server (`server-rust/src/main.rs`) uses axum's built-in WebSocket support via `async-graphql`. The `/graphql` route handler automatically upgrades WebSocket connections.

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

Root cause: async-graphql derives resolvers from struct field attributes — duplicate resolver definitions for the same field are a compile-time error, so this shouldn't happen in the Rust server.

If you see incorrect field values: check that the correct type definition is active (no stale imports) and that the resolver logic matches the schema definition in `server-rust/src/graphql/`.

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

---

## Playhead skips a chunk and then stalls

Symptoms: playback advances normally through chunk N, then jumps forward by ~5 minutes and immediately stalls with the buffering spinner. User reports "skipping a lot of footage". `Buffer health` log shows the buffered range capped at chunk N's end PTS while bytes-in-buffer keeps rising.

Root cause: chunk N+1's media segments are landing in the SourceBuffer (bytes counter rises) but NOT extending the playable range past chunk N's end. Two known triggers:

1. **`sourceBuffer.mode = "sequence"`** instead of `"segments"`. Check the `MSE ready` log's `source_buffer_mode` field — if it says `sequence`, the client bundle is stale (HMR miss / unrefreshed tab). Hard-refresh the tab.
2. **Continuation chunks' init segments not appended.** Each chunk's ffmpeg encode emits its own `elst` (edit list); without re-appending the init, chunk N+1's media is parsed against chunk N's edit list and Chrome silently drops the data. `ChunkPipeline.processSegment` must let init segments through unconditionally — see [`../../architecture/Streaming/02-Chunk-Pipeline-Invariants.md`](../../architecture/Streaming/02-Chunk-Pipeline-Invariants.md) § "Per-chunk init segments are required".

Diagnostic: in Seq, query `@MessageTemplate = 'Buffer health' and @TraceId = '...'` and inspect `buffered_ranges_json` over time. If you see `[[..., 300]]` plateauing while `total_bytes_appended` keeps climbing, you're in this scenario.

---

## `appendBuffer error` cascade — same error 30+ times in seconds

Symptoms: Seq shows a tight burst of `appendBuffer error` logs at the rate of incoming network segments (typically every ~400 ms for 4K), all with the same `message: "An attempt was made to use an object that is not, or is no longer, usable"`. Buffer eventually tears down.

Root cause: a non-recoverable `InvalidStateError` is hitting every queued segment. The first error's enriched fields tell you which of four MSE failure modes is firing:

| `error_name` | `media_source_ready_state` | `source_buffer_in_ms_list` | Cause |
|---|---|---|---|
| `InvalidStateError` | `closed` / `ended` / `null` | n/a | MediaSource was torn down (teardown raced with in-flight appends) |
| `InvalidStateError` | `open` | `false` | Browser detached our SourceBuffer under memory pressure (typical at >1 GB cumulative appended for one session) |
| `InvalidStateError` | `open` | `true` | `SourceBuffer.updating === true` race (concurrent ops from `seek` / `evictBackBuffer`) |

Every appendBuffer-error log carries `error_name`, `error_code`, `media_source_ready_state`, `source_buffer_in_ms_list`, `source_buffer_updating`, `data_bytes`, `segments_appended`, `total_bytes_appended` — see [`../../architecture/Observability/client/00-Spans.md`](../../architecture/Observability/client/00-Spans.md). The cascade itself is a secondary bug (each new network segment re-runs `drainQueue` against the dead SourceBuffer); the fix is to stop the upstream condition.

---

## Buffer balloons to hundreds of MB before stalling

Symptoms: `Buffer health` log shows `buffer_mb` climbing past ~150 MB and `total_bytes_appended` past 400 MB while `buffered_s` stays near the 60 s `forwardTargetS`. Eventually a `QuotaExceededError`-warn log fires and the buffer nukes.

Root cause: parallel foreground+lookahead appends are landing at overlapping PTS instead of contiguous source-time positions, so the SourceBuffer accumulates duplicated data without extending the timeline. Almost always a violation of the **chunk PTS contract** — see [`../../architecture/Streaming/02-Chunk-Pipeline-Invariants.md`](../../architecture/Streaming/02-Chunk-Pipeline-Invariants.md) § "Chunk PTS contract".

Quick check: ffprobe a chunk N>0 segment on disk (`tmp/segments/<jobId>/segment_0000.m4s`); the first packet's `pts_time` should be near `0` (raw `tfdt`-relative). If it equals `chunkStartSeconds` on disk, something upstream is baking in the offset. The correct PTS placement happens on the client — `BufferManager.setTimestampOffset(chunkStartS)` maps the raw `tfdt` into source-time. If chunk N+1 data piles up without extending the buffered range, check that `ChunkPipeline.processSegment` is calling `setTimestampOffset` on the init append (see [`../../architecture/Streaming/02-Chunk-Pipeline-Invariants.md`](../../architecture/Streaming/02-Chunk-Pipeline-Invariants.md) § "Chunk PTS contract").
