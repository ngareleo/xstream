---
name: feature-flags
description: Add, read, or remove a user-scoped feature flag in xstream. Flags live in client/src/config/flagRegistry.ts and persist per-user via the server's user_settings table. Use when the user asks to "add a flag for X", "make Y toggleable", or is wiring a new experimental setting into Settings → Flags.
allowed-tools: Bash(bun *), Read, Edit, Write
---

# Feature Flags

Feature flags are split across two files:
- `client/src/config/flagRegistry.ts` — declarations (`FLAG_KEYS`, `FLAG_REGISTRY`, `FlagDescriptor`)
- `client/src/config/featureFlags.ts` — runtime (cache, hydration, pub/sub, `getEffectiveBufferConfig`)

Flags persist per-user in the server's `user_settings` key/value table, hydrate once on app boot via the `settings(keys)` GraphQL query, and are readable from both React (`useFeatureFlag`) and non-React code (`getFlag`, `getEffectiveBufferConfig`).

## Add a flag — step by step

1. **Register it.** Append to `FLAG_REGISTRY` in `flagRegistry.ts`:
   ```ts
   {
     key: "flag.myFeature",        // "flag.<camelCase>" for booleans, "config.<camelCase>" for tunable numbers
     name: "My feature",
     description: "One line, user-facing.",
     valueType: "boolean",          // or "number"
     defaultValue: false,
     category: "playback",          // "playback" | "telemetry" | "ui" | "experimental"
   }
   ```
   The FlagsTab in Settings renders from the registry automatically.

2. **Update `docs/client/Feature-Flags/00-Registry.md` in the same commit.** Add a row to the table for the flag's category (or add the category if it was previously empty). Policy: the catalog must stay in lock-step with `FLAG_REGISTRY` so future contributors can audit what exists without reading TypeScript. A flag change with no doc update is a review-blocker.

3. **Read it in React:**
   ```ts
   const { value, setValue } = useFeatureFlag(FLAG_KEYS.myFeature, false);
   ```
   The setter calls the existing `setSetting` mutation and updates the module cache optimistically.

4. **Read it in non-React code:**
   ```ts
   getFlag(FLAG_KEYS.myFeature, false);   // synchronous, returns hydrated value or fallback
   ```
   `PlaybackController` follows this pattern: it calls `getEffectiveBufferConfig()` at `new BufferManager(...)` construction time — toggling a flag takes effect on the **next** playback session, not mid-stream.

5. **Do not introduce a new React context.** The module-level cache + `useSyncExternalStore` is the only subscription mechanism. Additional providers fragment the cache and break the non-React read path.

## Checklist before finishing

- [ ] `FLAG_REGISTRY` entry added with valid `key`, `name`, `description`, `valueType`, `defaultValue`, `category`
- [ ] `docs/client/Feature-Flags/00-Registry.md` table has a matching row
- [ ] Key follows `flag.<camelCase>` or `config.<camelCase>` convention
- [ ] React consumers use `useFeatureFlag`; non-React use `getFlag`/`getEffectiveBufferConfig`
- [ ] No new React context added
- [ ] `bun relay` run from `client/` if a new `settings` key was added to a query
- [ ] Lint + tsc clean (`cd client && bun run lint`)

## Remove a flag

1. Delete the entry from `FLAG_REGISTRY`.
2. Delete consumers (`useFeatureFlag` / `getFlag` calls) — the default can be inlined where the value is now hardcoded.
3. Remove the row from `docs/client/Feature-Flags/00-Registry.md`.
4. The orphan `user_settings` row in the DB is harmless; no migration needed.
