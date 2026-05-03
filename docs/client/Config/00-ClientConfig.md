# Client Config (`clientConfig`)

**Source:** `client/src/config/appConfig.ts`

Single exported `clientConfig: ClientConfig` object — the client-side mirror of the server's `AppConfig`. All client-side compile-time tunables live here, grouped into two namespaces.

## Two-layer config model

```
clientConfig (appConfig.ts)        ← compile-time defaults, always present
        ↓ fallback
featureFlags (featureFlags.ts)     ← runtime per-user overrides, some knobs only
```

`getEffectiveBufferConfig()` (in `featureFlags.ts`) reads `clientConfig.buffer` as the fallback when the `flag.experimentalBuffer` feature flag is off. When the flag is on, per-user `config.bufferForwardTargetS` / `config.bufferForwardResumeS` values from `user_settings` override the defaults. The `playback` namespace has no runtime-flag overrides today — all playback tunables come directly from `clientConfig`.

**Rule:** non-toggleable knobs belong in `appConfig.ts`. Knobs a user should be able to tune at runtime belong in `flagRegistry.ts` with a corresponding flag entry in `docs/client/Feature-Flags/00-Registry.md`.

## `ClientConfig` namespaces

### `playback`

| Key | Default | Purpose |
|---|---|---|
| `chunkRampS` | `[10, 15, 20, 30, 45, 60]` | Per-session cold-start ramp (seconds). Each `RampController.next()` call returns the next duration and advances the cursor. Resets at session start, every seek, MSE-detached recovery, and resolution switch so every fresh playhead gets the fast first-chunk curve. Replaces the old fixed 300 s / 30 s two-tier model. |
| `chunkSteadyStateS` | 60 | Steady-state chunk window after the ramp tail is exhausted (seconds of media per `startTranscode` mutation). Tuned separately from the ramp so steady-state can be widened later without changing the cold-start curve. |
| `prefetchThresholdS` | 90 | Seconds before chunk-end at which the next chunk's mutation fires. |
| `startupBufferS` | 2 | Minimum buffered seconds before `video.play()` is called on initial load. Uniform across all resolutions because the chunk ramp's 10 s first chunk provides an 8 s safety margin against post-play decoder stalls; per-resolution stratification is no longer load-bearing. |
| `bufferingSpinnerDelayMs` | 2000 | Continuous-stall threshold before the mid-playback spinner appears. |
| `minRealChunkBytes` | 1024 | Byte floor; chunks below this had no real frames (ffmpeg placeholder). |
| `firstRenderGraceMs` | 5000 | Suppresses StallTracker spinner during the post-`play()` first-frame decode window. |
| `seekBufferedToleranceS` | 0.5 | Tolerance when checking if a seek target is already buffered. |
| `userPausePollIntervalMs` | 1000 | Backpressure-check interval during user-pause (fills the silent `timeupdate` gap). |
| `maxRecoveryAttempts` | 3 | MSE recovery retry budget per session. |
| `defaultBackoffMs` | [500, 1000, 2000] | Exponential backoff schedule for the retry loop. |
| `driftThresholdMs` | 5000 | PlaybackTimeline drift threshold; fires `playback.timeline_drift` event when exceeded. |
| `rollingFirstByteWindow` | 5 | Rolling-average window for first-byte latency used to predict chunk seam arrival. |

### `buffer`

| Key | Default | Purpose |
|---|---|---|
| `forwardTargetS` | 60 | Pause stream when buffered-ahead exceeds this. |
| `forwardResumeS` | 20 | Resume stream when buffered-ahead drains below this (hysteresis). |
| `backBufferKeepS` | 10 | Evict media older than this behind the playhead to cap memory. |
| `healthLogIntervalSegments` | 20 | Emit a buffer-health log every N appended segments. |

## History

Previously the playback constants lived in `client/src/services/playbackConfig.ts` (UPPER_SNAKE_CASE) and buffer constants in `client/src/services/bufferConfig.ts`. Both were deleted in PR #35 (`cbfdd56` + `680e209`); constants migrated to `clientConfig` under camelCase keys. `PlaybackStatus` moved to `client/src/types.ts`. `BufferConfig` is re-exported as `ClientConfig["buffer"]` for backward-compatible imports.
