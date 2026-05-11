# Build Variants — Prod and Dev Side-By-Side

xstream produces two Tauri bundles from one source tree: a **prod** artifact shipped to end users and a **dev** artifact carrying the full developer surface (feature flags, DevPanel overlay, trace history, server-side playback history). They have different bundle identities, so both can be installed on the same machine without conflict.

The split is driven by a single build-time switch — `XSTREAM_VARIANT` — and enforced at three layers:

1. **Tauri config** — different `productName` / `identifier` per artifact.
2. **Client bundle** — Rspack `DefinePlugin` substitutes the global `IS_DEV_BUILD`; prod-dead branches are stripped before chunks are emitted.
3. **Server crate** — a `dev-features` Cargo feature gates dev-only queries, mutations, and DB read/write paths.

## 1. The control surface — `XSTREAM_VARIANT`

A single environment variable read by the build scripts in [`package.json`](../../../package.json).

| `XSTREAM_VARIANT` | `productName` | `identifier` | Cargo features | `IS_DEV_BUILD` | bun script |
|---|---|---|---|---|---|
| `prod` (default) | `xstream` | `com.example.xstream` | (none) | `false` | `bun run tauri:build` |
| `dev` | `xstream-dev` | `com.example.xstream-dev` | `dev-features` | `true` | `bun run tauri:build:dev` |

`bun run tauri:dev` runs the dev variant for day-to-day development.

The two installed apps have distinct bundle identities, so they cohabit. Each carries its own data directory under the user's standard application-data path; the SQLite DB is per-install.

## 2. Client strip — `IS_DEV_BUILD` + `devChunk`

Rspack's `DefinePlugin` is configured in [`client/rsbuild.config.ts`](../../../client/rsbuild.config.ts) to substitute a bare-identifier global:

```ts
define: { IS_DEV_BUILD: JSON.stringify(process.env.XSTREAM_VARIANT === "dev") },
```

The global is declared in [`client/src/types/env.d.ts`](../../../client/src/types/env.d.ts), so call sites reference it without an import.

### Pattern at the call site

Every dev-only component is wrapped in an `*Async.tsx` shim. The shim uses a fixed ternary against `IS_DEV_BUILD`:

```tsx
// client/src/components/flags-tab/FlagsTabAsync.tsx
export const FlagsTabAsync: FC = IS_DEV_BUILD
  ? devChunk(
      () => import(/* webpackChunkName: "FlagsTab" */ "./FlagsTab.js"),
      (m) => m.FlagsTab
    )
  : NoopFC;
```

Three call sites today: `DevPanelAsync`, `FlagsTabAsync`, `TraceHistoryTabAsync`. The full feature-flag runtime (`client/src/config/featureFlags.ts`, `client/src/contexts/FeatureFlagsContext.tsx`) and the Settings → Flags / Trace tab buttons (`SettingsPageContent.tsx`) gate on `IS_DEV_BUILD` too.

### Why the env check can't move into `devChunk`

The natural refactor — fold the ternary into the helper — defeats chunk stripping.

```tsx
// What it looks like to the bundler when devChunk does the check itself:
export function devChunk<M>(factory, selector): FC {
  if (!IS_DEV_BUILD) return NoopFC;   // statically dead in prod, but…
  …
}
export const FlagsTabAsync: FC = devChunk(
  () => import("./FlagsTab.js"),      // …import() sits in always-reachable
  (m) => m.FlagsTab                   // source. Rspack registers the chunk
);                                    // and emits the file.
```

Rspack scans `import()` expressions at parse time and registers a chunk for each one that appears in reachable source. Whether the chunk *file* is emitted depends on whether the surrounding syntax is statically dead — not on whether the lambda containing the `import()` is ever invoked at runtime. The inter-procedural analysis needed to prove the lambda is dead is not part of Rspack's DCE.

Empirically confirmed: encapsulating the check causes a prod build to emit `DevPanel.js` (4.7 kB), `FlagsTab.js` (7.4 kB), and `TraceHistoryTab.js` (4.7 kB) — ~19 kB of dev code leaks into prod.

The cost of keeping the ternary at the call site is three lines of boilerplate per shim. The benefit is reliable chunk stripping with no bundler-version dependency.

### `devChunk` helper

[`client/src/utils/devChunk.tsx`](../../../client/src/utils/devChunk.tsx) exports:

- `devChunk(factory, selector)` — wraps a dynamic import in `Suspense` + `React.lazy` via `lazyNamedExport`. Pair with a `webpackChunkName` magic comment so the chunk file has a stable name.
- `NoopFC` — renders `null`. Use as the prod-side arm of the ternary.

### Test harnesses mirror the define

[`client/vitest.config.ts`](../../../client/vitest.config.ts) and [`client/vitest.storybook.config.ts`](../../../client/vitest.storybook.config.ts) both set `define: { IS_DEV_BUILD: "true" }` so module-level references resolve under Vite/Rolldown. Tests always run as the dev variant.

## 3. Server strip — `dev-features` Cargo feature

[`server-rust/Cargo.toml`](../../../server-rust/Cargo.toml) declares an off-by-default feature:

```toml
[features]
default = []
dev-features = []
```

[`src-tauri/Cargo.toml`](../../../src-tauri/Cargo.toml) forwards it:

```toml
[features]
dev-features = ["xstream-server/dev-features"]
```

`#[cfg(feature = "dev-features")]` gates the following:

- DB query module: [`server-rust/src/db/queries/playback_history.rs`](../../../server-rust/src/db/queries/playback_history.rs) (re-export in [`db/mod.rs`](../../../server-rust/src/db/mod.rs), declaration in [`db/queries/mod.rs`](../../../server-rust/src/db/queries/mod.rs)).
- GraphQL field: `Query::playback_history` in [`graphql/query.rs`](../../../server-rust/src/graphql/query.rs).
- GraphQL field: `Mutation::record_playback_session` in [`graphql/mutation.rs`](../../../server-rust/src/graphql/mutation.rs).
- The `DELETE FROM playback_history` row inside `wipe_content` in [`db/queries/wipe.rs`](../../../server-rust/src/db/queries/wipe.rs).

The prod GraphQL schema therefore omits `playbackHistory` and `recordPlaybackSession` entirely — confirmable via `cargo run --bin print_schema -p xstream-server`.

The checked-in `server-rust/schema.graphql` is the **dev** schema (i.e. emitted with `--features dev-features`), because Relay codegen reads it and dev-only client modules reference both fields. `bun run schema:emit` and the CI drift check (`.github/workflows/ci.yml`) both pass `--features dev-features` for that reason; the strip happens at the chunk level (§2), not the schema level.

## 4. Migration backward-compat

The `playback_history` table migration in [`server-rust/src/db/migrate.rs`](../../../server-rust/src/db/migrate.rs) runs unconditionally — *not* behind `cfg(feature = "dev-features")`. This is deliberate: a user who installs the dev variant, accumulates rows, then switches to the prod install must not see a "no such table" error if the schema is ever inspected. Prod simply never inserts.

The matching wipe (§3) is gated; prod's `wipe_content` skips `playback_history` entirely.

## 5. Tauri configuration

Two config files:

- [`src-tauri/tauri.conf.json`](../../../src-tauri/tauri.conf.json) — the canonical config, used by the prod build.
- [`src-tauri/tauri.dev.conf.json`](../../../src-tauri/tauri.dev.conf.json) — an overlay loaded via `--config`. Sets `productName: "xstream-dev"`, `identifier: "com.example.xstream-dev"`, and the window title.

The dev variant build invokes `cargo tauri build … --features dev-features --config tauri.dev.conf.json`; the prod variant uses the default config and no features.

## 6. Verifying a build

Server schema:

```sh
# Prod — no playbackHistory / recordPlaybackSession fields
cargo run --bin print_schema -p xstream-server
# Dev — both fields present
cargo run --bin print_schema -p xstream-server --features dev-features
```

Client bundle:

```sh
# Prod
XSTREAM_VARIANT=prod bun run --filter client build
ls client/dist/static/js/async/ | grep -E "(DevPanel|FlagsTab|TraceHistory)" \
  && echo "FAIL — dev chunks leaked" \
  || echo "OK — no dev chunks"

# Dev
XSTREAM_VARIANT=dev bun run --filter client build
ls client/dist/static/js/async/ | grep -E "(DevPanel|FlagsTab|TraceHistory)"
```

End-to-end: `bun run tauri:build` and `bun run tauri:build:dev` produce two `.deb` files with distinct names, installable side-by-side on Linux.

## 7. Adding a new dev-only surface

Client component:

1. Create `Foo.tsx` and a sibling `FooAsync.tsx` that follows the ternary pattern in §2.
2. Add a `webpackChunkName` magic comment on the `import()`.
3. Import `FooAsync` from the consumer; never import `Foo` directly from prod-reachable code.

Server GraphQL field:

1. Add `#[cfg(feature = "dev-features")]` on the resolver method.
2. Add `#[cfg(feature = "dev-features")]` on every type and `db::` re-export that is only used by that resolver.
3. Regenerate `server-rust/schema.graphql` via `bun run schema:emit` (which builds with `--features dev-features`) so client Relay codegen picks up the new field.

Server DB write path:

- Gate the call site, not the table or the migration. Tables live for everyone; only the reads and writes are conditional.
