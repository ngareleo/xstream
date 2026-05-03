# FlagsTab

Feature flags management section in Settings. Displays all registered flags
grouped by category (Playback, Telemetry, UI, Experimental) with toggles or
number inputs. Supports both local storage overrides and server persistence.

**Source:** `client/src/components/flags-tab/`
**Used by:** SettingsPage right-pane, conditional render when `section=flags`.

## Role

Settings tab for toggling feature flags and tuning numeric parameters. Reads
flags from `FLAG_REGISTRY` (flagRegistry.ts), manages local state via
`useFeatureFlag()` context hook, and persists changes to both localStorage and
the server's `user_settings` table.

## Data sources

### Flag registry

`FLAG_REGISTRY` — array of flag descriptors, each with:
- `key: string` — unique flag identifier.
- `name: string` — display name.
- `description: string` — explanation of flag behaviour.
- `category: FlagCategory` — one of `"playback"`, `"telemetry"`, `"ui"`,
  `"experimental"`.
- `valueType: "boolean" | "number"` — control type.
- `defaultValue: boolean | number` — server default.
- `min?, max?, step?` — constraints for numeric flags.

### Feature flag context

`useFeatureFlag<T>(key, defaultValue)` — returns:
- `value: T` — current flag value (localStorage if set, else server/default).
- `setValue(v: T)` — writes to localStorage immediately; server sync is handled
  by the context (background mutation).

`useFeatureFlagControls()` — returns:
- `clearLocalOverrides()` — drops all localStorage values; server values then
  become authoritative.
- `resetAllToDefaults()` — sets every flag to its registry default and persists
  to server.

## Layout & styles

- Uses `useSettingsTabStyles()` and `useFlagsTabStyles()` from tab-specific
  styles module.
- **Section wrapper** — `className={styles.section}`.
- **Title & description** — standard section header.

### Flag categories

Flags are grouped by category and rendered in order (`CATEGORY_ORDER`):

- **Category header** — `styles.categoryHeader`: 10px, uppercase, faint text,
  bottom border.
- **Flag row** — flex container with label (left) and control (right).
  - **Flag name** — bold, 13px.
  - **Default hint** — "(default)" badge, faint text, 10px, visible when value
    equals `defaultValue`.
  - **Flag description** — 11px, muted, linewrap.
  - **Control** — right-aligned:
    - Boolean flags: `<SettingsToggle on={value} onChange={setValue} />`.
    - Numeric flags: `<NumberInput min/max/step onChange={setValue} />`.

### Bulk actions section

- **Section header** — `styles.actionsHeader`: "BULK ACTIONS" label.
- **Two action rows**:
  1. **Clear local overrides** — button + description. Clears localStorage.
     Shows toast: "Local overrides cleared. Reload the page…"
  2. **Reset all to defaults** — button + description. Resets all flags to
     registry defaults and persists to server.

## Behaviour

### Flag toggling

- Click toggle or edit number input → `setValue(next)`.
- Value is written to localStorage immediately.
- Background context mutation persists to server (non-blocking).
- Next playback session reads the new value.

### Bulk actions

- **Clear local overrides**: Calls `clearLocalOverrides()`, shows toast, does
  not reload. User must reload page manually for server values to take effect.
- **Reset all to defaults**: Calls `resetAllToDefaults()`, persists to server,
  clears toast state.

### Category visibility

Only categories with at least one flag are rendered (`filter(g => g.flags.length
> 0)`). Empty categories are hidden.

## Data

No Relay queries; all flag state flows through the feature flag context. Server
persistence is handled by the context's background mutation (wraps
`setUserFeatureFlag` mutation, not exposed here).

## Notes

- Flags are grouped and rendered in a fixed order to ensure consistent UI across
  sessions.
- The "(default)" hint helps users understand which toggles differ from registry
  defaults.
- Number inputs have `type="number"` with optional min/max constraints;
  non-finite values are rejected.
- Bulk actions are permanent and cannot be undone — consider adding a
  confirmation modal if this becomes a pain point.
- Strings are centralized in `FlagsTab.strings.ts` for i18n.
