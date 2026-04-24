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
| `vendor-otel` | all `@opentelemetry/*` | OTel sdk/api/exporters typically upgrade as a set |
| `vendor-griffel` | `@griffel/*` | Atomic CSS runtime; tracks Fluent UI cadence |
| `vendor-nova` | `@nova/*` | Event bus; independent cadence — see `enforce` note below |
| `vendor-router` | react-router, react-router-dom, @remix-run/router, history | Router ecosystem upgrades together |
| `vendor-misc` | residual `node_modules` | Tail bucket — currently ~46 KB |
| `shared` | app source modules used by 2+ async chunks | Prevents anonymous numeric Rspack chunks |

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

## Adding a new heavy dependency

1. Check whether its upgrade cadence matches an existing group. If yes, extend that group's `test` regex (keep the anchor form).
2. If independent: add a new `cacheGroups` entry with a two-digit priority above `vendor` (-10) so it takes precedence over the residual bucket.
3. If it is small and needs its own chunk: add `enforce: true`.
4. Run `bun run analyze` to verify the new group appears in `dist/stats.html` and `vendor-misc` shrinks accordingly.

## Bundle analysis

```bash
bun run analyze      # builds with BUNDLE_ANALYZE=1, opens dist/stats.html in browser
```

In CI the same report is generated headlessly (the `CI` env var suppresses `openAnalyzer`) and can be uploaded as a build artifact. The report file is always `dist/stats.html`.
