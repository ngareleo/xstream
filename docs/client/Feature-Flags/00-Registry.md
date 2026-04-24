# Feature Flags

This file is the authoritative catalog of feature flags the app ships with.

## Policy

**Any commit that adds, removes, or renames a flag MUST update this file in the same commit.** Reviewers should block a flag change that doesn't touch `docs/client/Feature-Flags/00-Registry.md` (this file). The doc exists so future contributors (and future agents) can answer "what flags exist, what do they do, what are their bounds?" without reading TypeScript.

The declaration side of the contract lives in `client/src/config/flagRegistry.ts`; the runtime (cache, hydration, pub/sub) lives in `client/src/config/featureFlags.ts`. See `CLAUDE.md` → *Add a new feature flag* for the step-by-step addition recipe.

## How flags work today

Per-user persistence. Each flag maps to a row in the server's `user_settings` key/value table (one row per `(userId, key)` pair — today there is effectively one user, but the shape is already per-user). On app boot, `FeatureFlagsProvider` issues a single bulk `settings(keys)` GraphQL query for every key in `FLAG_REGISTRY` and hydrates the module-level cache in `featureFlags.ts`. From that point on:

- React code reads/writes through `useFeatureFlag(FLAG_KEYS.myFlag, fallback)` — the setter optimistically updates the cache and fires the `setSetting` mutation.
- Non-React code reads through `getFlag(FLAG_KEYS.myFlag, fallback)` — synchronous, returns the hydrated value or the fallback. `PlaybackController` uses this pattern via `getEffectiveBufferConfig()`.

Changes take effect the next time the flag is read, not retroactively. Buffer tuning flags apply on the *next* playback session.

There is no server-side override today. A flag toggled off locally is off locally, nothing more. See `docs/todo.md` → FLAGS-001 for the planned release-time centralised controls.

## Current flags

Flags are grouped by `category` in the Settings → Flags tab.

### playback

| Key | Type | Default | Range | Purpose |
|---|---|---|---|---|
| `flag.experimentalBuffer` | boolean | `false` | — | Master switch for the buffer tuning overrides below. When off, `PlaybackController` ignores the per-flag values and uses `DEFAULT_BUFFER_CONFIG` (60 s target / 20 s resume / 10 s back-keep). When on, the two `config.buffer*` values below are read at `new BufferManager(...)` time. |
| `config.bufferForwardTargetS` | number | `DEFAULT_BUFFER_CONFIG.forwardTargetS` (currently 60) | `[2, 120]` step `1` | Pause the stream when `bufferedAhead` exceeds this many seconds. Raising this increases peak resident buffer memory (at 4K, 70 s ≈ 133 MB); lowering it risks underruns on bursty networks. Only applied when `flag.experimentalBuffer` is on. |
| `config.bufferForwardResumeS` | number | `DEFAULT_BUFFER_CONFIG.forwardResumeS` (currently 20) | `[0, 60]` step `1` | Resume the stream when `bufferedAhead` drops below this many seconds. The gap to the target is the hysteresis width — narrower gaps cause rapid pause/resume churn, wider gaps produce longer halts. Values below ~5 s are risky (a single network hiccup during refill can drain to 0 and stall the video). Only applied when `flag.experimentalBuffer` is on. |

For the full tradeoff explainer (mental model, memory table per resolution, chunks vs segments vs buffer), see [`Streaming Protocol → Hysteresis: tuning the gap`](./Streaming%20Protocol.md#hysteresis-tuning-the-gap).

### telemetry, ui, experimental

No flags registered yet. The categories exist so future flags can slot in without a UI change.

## Naming convention

- `flag.<camelCase>` — boolean feature toggles
- `config.<camelCase>` — tunable numeric values

Purely a naming convention, enforced only by code review. The FlagsTab groups by `category`, not by key prefix.

## Release-time centralised controls (future)

Today flags are per-user only. A user toggling a flag affects nobody else, which is fine for a single-user self-hosted deployment but unhelpful for a multi-user release. Tracked as `FLAGS-001` in `docs/todo.md`: a server-side `feature_flags` table with a precedence model (global override > user setting > `defaultValue`) and an admin UI, so an operator can soft-launch a flag to everyone with a single toggle.
