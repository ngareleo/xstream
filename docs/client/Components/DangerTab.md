# DangerTab

Destructive actions section in Settings (currently not implemented). Displays
a danger zone with a single disabled button for "Delete all matched metadata."
The feature is marked "coming soon" and is not wired to a mutation.

**Source:** `client/src/components/danger-tab/`
**Used by:** SettingsPage right-pane, conditional render when `section=danger`.

## Role

Settings tab for irreversible operations. Currently a placeholder; displays the
visual treatment (red border, red text, red button) and disabled button to
prevent accidental clicks.

## Queries & mutations

None. Button is permanently disabled (`disabled` attribute).

## Layout & styles

- Uses `useSettingsTabStyles()` from `SettingsTabs.styles.ts`.
- **Section wrapper** — `className={styles.section}`.
- **Danger zone container** — `styles.dangerZone`:
  - `border: 1px solid colorRed`.
  - `borderRadius: radiusMd`.
  - `padding: 16px`.
  - `backgroundColor: rgba(255, 93, 108, 0.04)` (light red tint).
- **Danger title** — `styles.dangerTitle`: "Danger Zone", 12px, bold, red.
- **Danger description** — `styles.dangerDesc`: Multi-line warning. "Delete all
  matched metadata. Videos will become unmatched and need to be re-linked. This
  cannot be undone."
- **Danger button** — `styles.btnDanger`:
  - `padding: 7px 14px`.
  - `border: 1px solid colorRed`.
  - `color: colorRed`.
  - `fontSize: 12px`, `fontWeight: 600`.
  - `cursor: not-allowed` (disabled).
  - `opacity: 0.5`.
  - Text: "Delete All Metadata (coming soon)".
  - Permanently disabled.

## Behaviour

- Component renders the danger zone with a disabled button.
- Click does nothing (button is disabled).
- No state or mutations.
- Future implementation will require:
  - A confirmation modal ("Are you sure? This cannot be undone.").
  - A mutation to clear the `video_match` table or equivalent metadata store.
  - A success message and optional undo UI (if feasible).

## Data

No Relay queries or mutations.

## Notes

- Danger zone styling is centralized in `SettingsTabs.styles.ts` and available
  to any tab that needs destructive actions.
- The "(coming soon)" text in the button label makes the unavailability
  explicit to users.
- Strings are centralized in `DangerTab.strings.ts` (LocalizedStrings).
- When this feature is implemented, the button should gain a confirmation flow
  and mutation wiring per project conventions (see Logging Policy for kill
  reasons and trace context threading).
