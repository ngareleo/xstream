# Bundle Chunk Strategy

**Source:** `client/rsbuild.config.ts` — `performance.chunkSplit`

## Principle: group by upgrade cadence

Each Rspack `cacheGroups` entry represents one browser cache unit. The rule is: **libraries that version together live in the same chunk.** A single dependency upgrade should invalidate as few cache entries as possible.

Before this split, a catch-all `vendor-misc` chunk bundled OTel, Griffel, Nova, React Router, and graphql-ws together — 396 KB — so any single package bump busted the entire vendor cache for every user.

Current groups and their rationale:

| Chunk | Contents | Cadence note |
|---|---|---|
| `vendor-react` | react, react-dom, scheduler | React major/minor is rare; usually ships together |
| `vendor-relay` | relay-runtime, react-relay, graphql, graphql-ws | Data-layer upgrade unit |
| `vendor-otel` | all `@opentelemetry/*` + `protobufjs`/`@protobufjs/*` | OTel sdk/api/exporters upgrade as a set; protobufjs is an OTLP-proto transitive dep on the same cadence |
| `vendor-griffel` | `@griffel/*` | Atomic CSS runtime; tracks Fluent UI cadence |
| `vendor-nova` | `@nova/*` | Event bus; independent cadence — see `enforce` note below |
| `vendor-router` | react-router, react-router-dom, @remix-run/router, history | Router ecosystem upgrades together |
| `vendor-supabase` | all `@supabase/*` (auth-js, postgrest-js, realtime-js, storage-js, functions-js, phoenix) | Supabase JS SDK; the whole SDK versions together (~190 KB) |
| `vendor-misc` | residual `node_modules` | Tail bucket — ~46 KB after splitting Supabase out |
| `shared.<routes>` | app source modules used by 2+ async route chunks, **split by route affinity** | One chunk per distinct set of sharing routes — each route loads only the shared code it references (see below) |

## Regex anchor invariant — do not weaken

Bun stores package files under a directory whose name encodes the full package specifier:

```
node_modules/.cache/…/@nova+react@2.9.2/…/index.js
```

A regex like `/react/` would match that path and incorrectly absorb `@nova/react` into the `vendor-react` group. The correct form anchors on the inner `node_modules/<package>/` boundary:

```ts
// CORRECT — anchors on node_modules/<pkg>/
test: /[\\/]node_modules[\\/](?:react|react-dom|scheduler)[\\/]/

// WRONG — matches @nova+react@ver, @scope+react-dom@ver, etc.
test: /[/+]react@|[/+]react-dom@|\/scheduler\//
```

**This anchor form must be preserved.** Do not simplify it to a bare name match — it will silently misroute scoped packages.

## `enforce: true` for sub-minSize chunks

Rspack's default `minSize` threshold is 20 KB; chunks below that are merged into their caller. `@nova/*` is well under that limit but upgrades on its own cadence. Setting `enforce: true` on the `nova` group bypasses the size threshold and guarantees it always gets its own file.

Use `enforce: true` for any group whose independent cache identity is worth an extra HTTP request even when it's small.

## Route-affinity `shared` chunks

App-source modules referenced by 2+ async route chunks are **not** coalesced
into a single global `shared` file. Instead the `shared` cacheGroup uses a
`name(module, chunks)` function that keys each module by the sorted set of
route chunks that reference it, producing chunks like
`shared.CreateProfilePage~EditProfilePage` (ProfileForm) or
`shared.ResetPasswordPage~SignInPage~SignUpPage` (AuthForm). A route then
downloads only the shared code it actually uses — HomePage no longer pulls the
profile-form or auth-form code it never renders.

`minSize: 0` on this group forces every affinity cluster to extract, however
small, rather than duplicating it back into route chunks. The extra chunk count
is free: the bundle is served locally from `tauri://localhost`, so there is no
per-request network cost (see `docs/architecture/Deployment/`).

**Keep page-specific code out of `shared`.** A module lands in a `shared.*`
chunk only when ≥2 route chunks reach it. Two anti-patterns cause page-specific
code to leak across routes:

1. **One page importing another page's module.** If page B imports a value from
   page A's module, A's whole subtree becomes reachable from B's chunk and is
   hoisted into `shared`. Fix: extract the shared value to its own module, or
   duplicate it. Example: `EditProfilePageContent` owns a duplicate
   `EditProfilePageContentRefetchQuery` rather than importing `ProfilesPage`'s
   query.
2. **A non-top-level component issuing a full query.** Query normalization nodes
   are large; if a shared component carries one it drags that weight into
   `shared`. Per `docs/architecture/Relay/`, **queries live on top-level route
   components; child/leaf components expose fragments.** Duplicating a query
   across two pages is preferred over sharing it. (Genuinely interactive,
   user-triggered component queries — `DirectoryBrowserQuery`,
   `DetailPaneEditSearchQuery` — are a sanctioned exception.)

## Adding a new heavy dependency

1. Check whether its upgrade cadence matches an existing group. If yes, extend that group's `test` regex (keep the anchor form).
2. If independent: add a new `cacheGroups` entry with a two-digit priority above `vendor` (-10) so it takes precedence over the residual bucket.
3. If it is small and needs its own chunk: add `enforce: true`.
4. Run `bun run analyze` to verify the new group appears in `dist/stats.html` and `vendor-misc` shrinks accordingly.

## Size gates

Two chunks are guarded by an automated size gate so the wins above can't silently regress:

| Chunk | Ceiling (raw, decimal kB) | Why it's guarded |
|---|---|---|
| `vendor-misc` | **200 kB** | Residual `node_modules` bucket. Growth past this means a heavy dep landed here instead of getting its own cacheGroup. |
| `shared.*` (aggregate) | **50 kB** | Total of all route-affinity shared chunks. Growth means page-specific code is leaking into shared (cross-page import or a component-level query). |

The gate is a standalone Vitest test at `client/__tests__/bundleSize.test.ts`, run via `bun run test:bundle-size` against the production `dist/` (it reads the build output, so it runs **after** `bun run build` — wired as its own CI step, separate from the unit suite). Limits are named constants in that file; sizes are raw bytes in decimal kB to match Rsbuild's `printFileSize`.

**Raising a limit requires good reason.** A failing gate is first a signal to investigate (did a dep land in the wrong group? did a page query get imported across a boundary?), not to bump the number. Only raise a ceiling — in the same PR, with the justification in the description — once you've confirmed the growth is legitimate and unavoidable.

## Bundle analysis

```bash
bun run analyze      # builds with BUNDLE_ANALYZE=1, opens dist/stats.html in browser
```

In CI the same report is generated headlessly (the `CI` env var suppresses `openAnalyzer`) and can be uploaded as a build artifact. The report file is always `dist/stats.html`.
