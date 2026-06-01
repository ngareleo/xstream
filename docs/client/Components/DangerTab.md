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

All mutations gate on `!ctx.pool.has_active_jobs()` and `scan_state.is_scanning()` — they fail server-side if jobs are running or a library scan is in progress. **Note:** The guard checks `FfmpegPool::has_active_jobs()` (actual running/dying processes), not `job_store.is_empty()`, because the job store is a cache that also retains **completed** transcodes for reuse by the chunker. A finished playback previously left a permanent entry until server restart. The wipe mutation also calls `ctx.job_store.clear()` to delete the cache since it removes the `transcode_jobs` and `segments` rows the cache mirrors.

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
- **Button stack** — `styles.stack`: vertical flex layout, gap 8px between rows.
- **Row layout** — `styles.row`: horizontal flex, space-between (title/desc on left, button on right). Gap 16px.
- **Row title** — `styles.rowTitle`: operation name (e.g. "Wipe Database"), bold.
- **Row description** — `styles.rowDesc`: short explanation of what the operation does.
- **Button** — `styles.btn`:
  - Base: padding 8px 12px, border 1px solid colorRed, color colorRed, fontSize 12px, fontWeight 600.
  - **Armed state** (`styles.btnArmed` class applied): backgroundColor rgba(255, 93, 108, 0.12) (light red tint).
  - **Pending state** (`disabled` attr): cursor not-allowed, button text shows `btnPending` ("Wiping…").

## Behaviour

**Click flow per button:**

1. **Idle state** (default). Button displays `btnIdle` ("Wipe") label. Click arms the button.
2. **First click** → Arms the button. Text changes to `btnConfirm` ("Click again to confirm"), 3-second countdown starts. Button remains clickable.
3. **Second click within 3 seconds** → Fires the mutation. Button text changes to `btnPending` ("Wiping…"), disabled. On completion (success or error), button reverts to idle state. Result is reported via a **toast notification** (not an inline status row):
   - **Success**: `toastOkFormat` — `"{title} — done."` e.g. "Wipe Database — done." (success toast, auto-dismisses)
   - **Error**: `toastFailFormat` — `"{title} failed: {error}"` e.g. "Wipe Database failed: jobs are running." (error toast, auto-dismisses)
4. **No second click within 3 seconds** → 3-second window closes, button reverts to idle state. User must click again to re-arm.

**wipeAll button special case:**

- Identical two-click flow to targeted wipes.
- On successful completion, also clears client-side localStorage via `clearAppLocal()` (removes `PaneWidth`, `ProfilesLastFilm`, and any other app-owned persisted UI state). Server-side wipes (db, posters, segments) complete as with the targeted buttons; only "Wipe Everything" touches the client.
- Toast is the only feedback before the app's cached data becomes stale.

## Feedback

Wipe operation results are reported via the app-wide toast system (`useToast()` from `~/hooks/useToast.js`). Success and failure messages are named operations (e.g. "Wipe Database") so the user knows exactly what action completed, rather than a generic "Done" or "Failed" message.

## Notes

- Strings are centralized in `DangerTab.strings.ts` (LocalizedStrings) — button labels (`btnIdle`, `btnConfirm`, `btnPending`), operation titles, descriptions, and toast messages (`toastOkFormat`, `toastFailFormat`).
- No Relay query dependencies — pure mutation-driven component. After a successful wipe, the app's local data is stale; the user should refresh or navigation will refetch.
- The three-second "click again" window is generous enough to catch accidental double-clicks but short enough that a user can't arm one button, switch context, and forget which one was armed.
- Wipe feedback is consolidated into the app-wide toast system — all results (success and error) appear as dismissible toasts from the top of the screen, not as per-row inline status lines. This consolidates feedback onto a single, consistent surface.
- The two-click flow exists purely because these are destructive, non-recoverable operations. Industry-standard confirmation UX.
