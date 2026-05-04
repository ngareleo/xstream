# DangerTab

Destructive actions section in Settings. Displays four wipe buttons with a two-click confirmation UX to prevent accidental data loss.

**Source:** `client/src/components/danger-tab/`
**Used by:** SettingsPage right-pane, conditional render when `section=danger`.

## Role

Settings tab for irreversible operations. Provides one-click (arm) + one-click (execute) confirmation flow for four destructive mutations: `wipeDb`, `wipePosterCache`, `wipeSegmentCache`, `wipeAll`. Each button displays real-time loading state and result feedback.

## Mutations

Four GraphQL mutations, all `Boolean!` returning (always true on success):

1. **`wipeDb`** — Delete all libraries, films, shows, videos, metadata, watchlist, and playback progress. Preserves user settings and schema. Re-opening the app shows an empty library.
2. **`wipePosterCache`** — Delete all cached poster images. Subsequent metadata queries re-download posters as needed.
3. **`wipeSegmentCache`** — Delete all transcoded segment files. In-flight transcode jobs will have their output deleted, breaking playback mid-stream.
4. **`wipeAll`** — Kill all in-flight jobs, then call the above three in sequence. Atomic from the user perspective.

All mutations gate on `job_store.is_empty()` and `scan_state.is_scanning()` — they fail server-side if jobs are running or a library scan is in progress.

## Layout & styles

- Uses `useSettingsTabStyles()` from `SettingsTabs.styles.ts` (shared with other tabs).
- **Section wrapper** — `className={styles.section}`.
- **Danger zone container** — `styles.dangerZone`:
  - `border: 1px solid colorRed`.
  - `borderRadius: radiusMd`.
  - `padding: 16px`.
  - `backgroundColor: rgba(255, 93, 108, 0.04)` (light red tint).
- **Danger title** — `styles.dangerTitle`: "Danger Zone", 12px, bold, red.
- **Danger description** — `styles.dangerDesc`: Multi-line warning explaining the four options.
- **Button stack** — `styles.buttonStack`: vertical flex layout, gap 8px between buttons.
- **Danger button** — `styles.btnDanger`:
  - Base: `padding: 8px 12px`, `border: 1px solid colorRed`, `color: colorRed`, `fontSize: 12px`, `fontWeight: 600`.
  - **Armed state** (`data-armed="true"`): `backgroundColor: rgba(255, 93, 108, 0.12)`, `cursor: pointer` (indicates 3-second window is active).
  - **Loading state**: button text appends a 20×20 spinner; cursor becomes `not-allowed`; opacity dims.
  - **Disabled state**: `cursor: not-allowed`, `opacity: 0.5` (before first click or after 3s armed window expires).
- **Inline status row** (beneath each button) — `styles.statusText`:
  - Empty or hidden when idle.
  - Shows `"✓ Success"` (green) on wipe completion.
  - Shows `"✗ Failed: <reason>"` (red) on error.
  - Clears after 3 seconds.

## Behaviour

**Click flow per button:**

1. **Idle state** (default). Button is disabled (opacity 0.5, `cursor: not-allowed`). Click does nothing.
2. **First click** → Arms the button. Visual feedback: button changes to `data-armed="true"` state (light red bg, `cursor: pointer`), text changes from `"<label>"` to `"<label> — Click again to confirm"`, 3-second countdown starts.
3. **Second click within 3 seconds** → Fires the mutation. Loading spinner appears on button; status row shows loading state. On success, status row shows `"✓ Success"` and auto-clears after 3s. On error, shows `"✗ Failed: <error message>"` and auto-clears after 3s. After mutation completes (or timeout), button reverts to idle state.
4. **No second click within 3 seconds** → 3-second window closes, button reverts to idle state. User must click again to re-arm.

**wipeAll button special case:**

- Identical two-click flow, but the mutation is always the last user action in a session (app state is completely cleared, so the UI stale regardless).
- Status message is the only feedback before the app goes blank or restarts.

## Data

All four mutations are locally triggered (no Relay queries). After a successful wipe, the app's local data is stale; the user should refresh the page or the app should naturally refetch on the next navigation.

## Notes

- Strings are centralized in `DangerTab.strings.ts` (LocalizedStrings) — button labels, confirmation prompts, status messages.
- No Relay query dependencies — pure mutation-driven component.
- The three-second "click again" window is generous enough to catch accidental double-clicks but short enough that a user can't arm one button, switch context, and forget which one was armed.
- Each button's status persists for 3 seconds after success/error, then auto-clears. Subsequent mutations can overwrite the status row if the user clicks another button.
- The two-click flow exists purely because these are destructive, non-recoverable operations. Industry-standard confirmation UX.
