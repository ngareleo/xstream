# VideoPlayer

Media Source Extensions (MSE) video playback engine. Manages the `<video>` HTML element, playback state machine (idle → loading → playing → ended), job lifecycle subscription, controls visibility, and error handling. Communicates playback state changes to the parent via `onStatusChange` callback.

**Source:** `client/src/components/video-player/`
**Used by:** `VideoArea` (rendered inside `.videoWrapper` with Suspense fallback).

## Role

The core playback orchestrator. Owns the MSE-backed video element, manages resolution transitions via `useVideoPlayback` hook, subscribes to background transcode jobs via `useJobSubscription`, and surfaces errors from either the mutation side (MSE seek failures) or the job-subscription side (probe/encode failures). Routes Nova eventing for play/pause, seek, resolution, volume, and fullscreen commands. Auto-hides controls after 3000ms inactivity.

## Props

| Prop | Type | Notes |
|---|---|---|
| `video` | `VideoPlayer_video$key` | Relay fragment ref. Carries `id`, `durationSeconds`, `videoStream`, and spreads fragments for `ControlBar` and `PlayerEndScreen`. |
| `onStatusChange` | `(status: "idle" \| "loading" \| "playing") => void` | Optional. Fired on state transitions. Used by parent to fade backdrop poster when playback begins. |

## Layout & styles

- **Root container** (`.root`): `position: relative`, `width: 100%`, `height: 100%`, `backgroundColor: transparent`. Transparent so VideoArea's backdrop poster shows through before playback starts.
- **Video element** (`.video`): `width: 100%`, `height: 100%`, `display: block`, `objectFit: contain`, `backgroundColor: transparent`. Captures click-to-play/pause events.
- **Idle overlay** (`.idleOverlay`): Full-area scrim, `backgroundColor: rgba(0,0,0,0.35)`, `cursor: pointer`, `zIndex: 5`. No visible button; primary affordance is the green play disc in ControlBar.
- **Loading overlay** (`.loadingOverlay`): Flex-centered, full-area, `backgroundColor: rgba(0,0,0,0.35)`, `pointerEvents: none`. Contains 56×56 spinner with green top arc, 0.9s linear rotation.
- **Progress label** (`.progressLabel`): Top-left `position: absolute`, dark background, `fontFamily: fontMono`, `fontSize: 12px`, displays transcode progress (e.g., `"Transcoding 45/120"`) only during loading.
- **Error overlay** (`.errorOverlay`): Top-left, dark red background `rgba(206,17,38,0.85)`, white text, `fontSize: 13px`.

## Behaviour

### Playback state machine

- **idle** (initial): User has not started playback. Overlay shown. Spacebar or ControlBar play button transitions to **loading**.
- **loading**: Transcode job spinning up or seeking MSE buffer. Spinner visible. `setTimeout(600ms)` simulates decoder warm-up (production: bound to MSE `canplay` event). Transitions to **playing** or **error**.
- **playing**: Video frames rendering. Overlay hidden. Controls visible unless idle. `isEnded` flag set by video's `ended` event. When user clicks ControlBar play button while playing, toggles native video element pause/play.
- **ended**: Video reached duration. `isEnded` flag set. Overlay hidden; ControlBar hidden; PlayerEndScreen rendered (lazy-loaded).

### Control lifecycle

Controls auto-hide after 3000ms inactivity when `status === "playing"`. Movements on `.root` (`onMouseMove`, `onMouseEnter`) call `showControls()`, which sets `controlsVisible: true` and re-arms the timer. On `onMouseLeave`, timer is cleared and controls hide immediately. When `status !== "playing"`, controls always visible regardless of inactivity.

### Nova event handling

All playback commands flow through a `NovaEventingInterceptor`. The interceptor intercepts these events from ControlBar:
- **PlayRequested**: calls `handlePlay()` → `startPlayback(resolution)`.
- **SeekRequested**: calls `seekTo(targetSeconds)` from `useVideoPlayback` hook.
- **SkipRequested**: directly mutates `videoRef.current.currentTime += seconds`.
- **VolumeChanged**: directly mutates `videoRef.current.volume = volume`.
- **ResolutionChanged**: calls `handleResolutionChange(res)` → `startPlayback(res)` (restarts job at new resolution).
- **FullscreenRequested**: calls `containerRef.current.requestFullscreen()` or `document.exitFullscreen()`.

### Spacebar global handler

Spacebar toggles play/pause globally while on the player page (unless input/textarea/select is focused). If `status === "idle"`, spacebar calls `handlePlay()`. If `status === "playing"`, spacebar toggles native `videoRef.play()/pause()`.

### Error handling

Two error channels:
1. **Mutation-side** (`useVideoPlayback` hook's `error`): MSE operations, seek rejections — fast feedback.
2. **Job-subscription-side** (`setJobError`): Probe failed, encode failed, job killed — slower (job lifecycle) but captures long-running failures. Maps error codes (PROBE_FAILED, ENCODE_FAILED) to user-facing messages.

Whichever surfaces first is shown in the error overlay; no auto-retry.

## Data

- **Fragment**: Carries `id`, `durationSeconds`, `videoStream { height, width }`. Spreads `...ControlBar_video` and `...PlayerEndScreen_video`.
- **Hooks**:
  - `useVideoPlayback(videoRef, videoId, durationSeconds, setActiveJobId)` — initiates MSE job, manages seeking, returns `{ status, error, startPlayback, seekTo }`.
  - `useJobSubscription(activeJobId, callback)` — subscribes to transcode job lifecycle (progress, error, completion). Surfaces `{ status, completedSegments, totalSegments, errorCode, error }`.
  - `useVideoSync(videoRef)` — tracks `currentTime` and `isPlaying` from native video element for ControlBar time/play-state display.

## Notes

- **No ControlBar playback logic inside VideoPlayer**: ControlBar is purely presentational; VideoPlayer owns all state. Nova eventing wires their interaction.
- **Ended state reset on video change**: When Router reuses VideoPlayer (navigating between player routes without remounting), `useEffect` clears `isEnded` on `data.id` change to prevent stale end-screen persisting.
- **Fullscreen tracking**: Browser's `fullscreenchange` event listener syncs `isFullscreen` state for ControlBar's fullscreen button icon toggle.
- **Click-to-play/pause on video element**: Direct `onClick` handler on `<video>` element — ControlBar and overlays intercept their own clicks before bubbling, so no filtering needed.
- **PlayerEndScreen lazy-loaded**: Rendered via `Suspense` fallback when `isEnded && (isPlaying || true)` — ensures post-playback UI doesn't block initial render.
