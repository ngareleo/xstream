# ControlBar

Bottom playback controls chrome. Displays seek timeline with hover tooltip, current/total time, skip buttons (−10s, +10s), play/pause toggle, volume slider, resolution picker dropdown, and fullscreen button. All control interactions fire Nova events, which VideoPlayer's interceptor routes to backend playback commands.

**Source:** `client/src/components/control-bar/`
**Used by:** `VideoPlayer` (rendered inside `NovaEventingInterceptor`, visibility gated by `isVisible` prop).

## Role

The primary playback UI surface. Owns timeline scrubbing (with hover-preview tooltip), resolution picker menu, and playback control event dispatch. Stateless — all playback state (currentTime, isPlaying, resolution) flows in as props from VideoPlayer. Uses `useVideoSync` hook to read native video element state for real-time timeline/play-state updates.

## Props

| Prop | Type | Notes |
|---|---|---|
| `video` | `ControlBar_video$key` | Relay fragment ref. Carries `durationSeconds` and `videoStream { height, width }`. |
| `videoRef` | `RefObject<HTMLVideoElement \| null>` | Reference to VideoPlayer's `<video>` element for state reads and seeking. |
| `resolution` | `Resolution` | Current active resolution (e.g., `"4K"`, `"1080p"`). |
| `status` | `"idle" \| "loading" \| "playing"` | Playback state machine. Affects play button icon and interactivity. |
| `isVisible` | `boolean` | When false, ControlBar fades out (`opacity: 0`, `pointerEvents: none`). |
| `isFullscreen` | `boolean` | Toggles fullscreen button icon (arrows-out vs arrows-in). |

## Layout & styles

### Root (`.root`, `.rootHidden`)

- `position: absolute`, `bottom: 0`, `left: 0`, `right: 0`, `padding: 20px 26px 24px`.
- `transitionProperty: opacity`, `transitionDuration: 0.3s`, `zIndex: 10`.
- When `!isVisible`, applies `rootHidden`: `opacity: 0`, `pointerEvents: none`.

### Progress row (`.progressRow`)

- `display: flex`, `alignItems: center`, `columnGap: 14px`, `marginBottom: 14px`.
- **Timestamps** (`.timeLabel`, `.timeLabelDim`): `fontMono 11px`, `fontVariantNumeric: tabular-nums`. Current time in white; duration in `rgba(255,255,255,0.6)`.
- **Track** (`.track`): `flexGrow: 1`, `position: relative`, `height: 3px`, `backgroundColor: rgba(255,255,255,0.18)`, `borderRadius: 2px`, `cursor: pointer`. On `:hover`, `height: 5px`.
  - **Fill** (`.trackFill`): Left-aligned, width tracks progress percentage, `backgroundColor: colorGreen`, `boxShadow: 0 0 8px colorGreenGlow`.
  - **Knob** (`.trackKnob`): `width: 12px`, `height: 12px`, circle (`borderRadius: 50%`), positioned at progress percentage, green with glow shadow.
  - **Tooltip** (`.trackTooltip`): Appears on hover, shows timestamp of mouse position. `backgroundColor: colorSurface2`, white text, positioned `bottom: calc(100% + 10px)`, centered on cursor x. `pointerEvents: none`, `whiteSpace: nowrap`.

### Controls row (`.controlsRow`)

- `display: flex`, `alignItems: center`, `columnGap: 16px`, `color: #fff`.
- **−10s button** (`.ctrlBtn`): Transparent bg, no border, `padding: 8px 12px`, `fontMono 11px`, `cursor: pointer`. Hover: `backgroundColor: rgba(255,255,255,0.08)`. Transition: 0.2s.
- **Play button** (`.ctrlBtnPlay`): 48×48 circle, `backgroundColor: colorGreen`, `color: colorGreenInk`, no padding, `boxShadow: 0 4px 14px colorGreenSoft`. Hover: `transform: scale(1.06)`, `boxShadow: 0 6px 20px colorGreenGlow, 0 0 28px colorGreenSoft`. Active: `scale(0.96)`.
  - **Idle animation** (`.ctrlBtnPlayIdle`): When `status === "idle"`, play button pulses: scale `1 → 1.04 → 1`, box-shadow inflates `4px green-soft → 22px colorGreenGlow + 32px colorGreenSoft`, duration 2.4s infinite ease-in-out. On `:hover`, always scale 1.06 + 28px glow.
  - **Loading state**: Icon replaced with 20×20 spinner (green top arc, 2px border, 0.75s linear spin).
- **+10s button** (`.ctrlBtn`): Same as −10s.
- **Spacer** (`.flexFill`): `flexGrow: 1`.
- **Volume group** (`.volumeGroup`): `display: flex`, `alignItems: center`, `columnGap: 8px`. Contains `<IconSpeaker>` and volume slider.
  - **Volume slider** (`.volumeSlider`): `height: 3px`, `accentColor: colorGreen`, `cursor: pointer`. Width and opacity transitions on hover: `width: 0 → 80px`, `opacity: 0 → 1` over 0.2s.
- **Resolution chip** (`.resChip`): `fontMono 9px uppercase`, `color: colorGreen`, `backgroundColor: colorGreenSoft`, green-bordered chip, `padding: 4px 8px`, `borderRadius: radiusSm`, `cursor: pointer`.
  - **Resolution menu** (`.resMenu`): Dropdown above chip, `position: absolute`, `bottom: calc(100% + 8px)`, `right: 0`. `backgroundColor: colorSurface2`, bordered, `borderRadius: radiusMd`, `minWidth: 100px`, `zIndex: 100`. Each resolution item is a button: `width: 100%`, `padding: 8px 14px`, transparent bg, `fontSize: 12px`, `color: rgba(255,255,255,0.7)`. Hover: `backgroundColor: rgba(255,255,255,0.05)`, `color: #fff`. Active item: `resItemActive` applies `color: colorGreen`, `backgroundColor: colorGreenSoft`.
- **Fullscreen button** (`.ctrlBtn`): Icon toggles between arrows-out and arrows-in based on `isFullscreen`.

## Behaviour

### Timeline interaction

- **Seek on click** (`.track` `onClick`): Computes `fraction = (clientX - rect.left) / rect.width`, clamps to `[0, 1]`, multiplies by `durationSeconds`. Fires `SeekRequestedEvent(targetSeconds)` via Nova bubble. VideoPlayer intercepts and calls `seekTo()` which handles MSE buffering.
- **Hover tooltip**: On `onMouseMove`, computes same x→seconds math, stores in state, renders tooltip. On `onMouseLeave`, clears tooltip.

### Play/pause toggle

- **Status idle**: Clicking play button fires `PlayRequestedEvent()`, triggers VideoPlayer's `handlePlay()` → `startPlayback(resolution)`.
- **Status loading/playing**: Clicking toggles native `videoRef.play()/pause()` directly.
- **Icon morphing**: When `status === "loading"`, the play icon morphs to a 20×20 spinner (green top arc, 2px border, 0.75s linear spin). This in-place spinner is the sole loading affordance, replacing the old full-area overlay. It stays in the center of the 48×48 play button disc and remains on-screen without requiring mouse movement — a modern, non-disruptive signal of transcoding/buffering activity.

### Resolution picker

- Dropdown opens/closes on chip click.
- Only shows resolutions available for the current video's native height (derived from `maxResolutionForHeight`). Filtered to show only resolutions at native height or lower.
- Clicking a resolution fires `ResolutionChangedEvent(resolution)`, closes dropdown, triggers playback restart at new resolution.

### Volume control

- Slider appears on hover in the volume group (`onMouseEnter` → `setShowVolumeSlider(true)`).
- Input range `min: 0`, `max: 1`, `step: 0.05`, `defaultValue: 1`.
- `onChange` fires `VolumeChangedEvent(volume)` where volume is `parseFloat(target.value)`.

### Fullscreen toggle

- Clicking fullscreen button fires `FullscreenRequestedEvent()`.
- VideoPlayer intercepts and calls `document.fullscreenElement ? exitFullscreen() : containerRef.requestFullscreen()`.
- Icon updates based on `isFullscreen` prop tracking browser's `fullscreenchange` event.

## Data

- **Fragment**: Carries `durationSeconds` and `videoStream { height, width }`.
- **Hook**: `useVideoSync(videoRef)` returns `{ currentTime, isPlaying }` — synced to native video element state for real-time timeline and play-state updates.
- **Events**: All control actions fire Nova events (types defined in `ControlBar.events.ts`):
  - `PlayRequestedEvent()` — no payload.
  - `ResolutionChangedEvent(resolution)` — payload: `{ resolution: Resolution }`.
  - `SeekRequestedEvent(targetSeconds)` — payload: `{ targetSeconds: number }`.
  - `SkipRequestedEvent(seconds)` — payload: `{ seconds: number }` (positive = forward, negative = backward).
  - `VolumeChangedEvent(volume)` — payload: `{ volume: number }` (0–1, normalized).
  - `FullscreenRequestedEvent()` — no payload.

## Notes

- **Stateless design**: ControlBar is fully controlled by parent props. All state (currentTime, isPlaying, resolution) flows in; all actions flow out as Nova events.
- **Seek vs. skip distinction**: Seek sets absolute position (from timeline click); skip adds/subtracts relative seconds (−10s/+10s buttons, keyboard shortcuts). VideoPlayer's interceptor routes both to different handlers.
- **Idle play pulse**: The green play button's 2.4s scale/glow animation signals readiness to start playback without forcing interaction. On hover, the animation is suppressed by the hover scale(1.06).
- **Timeline knob vs. fill**: Knob is a separate element positioned at the current time percentage, giving visual feedback on the exact seek position. Fill extends from left to knob.
- **Accessibility**: Track has `role="slider"` with full ARIA attributes (valuemin, valuemax, valuenow, aria-label). Skip buttons, play button, volume slider, and fullscreen button all have descriptive aria-labels.
