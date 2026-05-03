# SettingsTabs

Shared style utilities export for all Settings page tabs. `SettingsTabs.styles.ts`
exports `useSettingsTabStyles()` hook, which defines common CSS classes for tab
layout, forms, buttons, and danger-zone styling. Not a component; a styles module.

**Source:** `client/src/components/settings-tabs/SettingsTabs.styles.ts`
**Used by:** LibraryTab, FlagsTab, MetadataTab, DangerTab, TraceHistoryTab.

## Role

Centralized style definitions for settings tab structure and form controls.
Reduces duplication across five tabs and enforces consistent visual language
for section titles, form inputs, buttons, and the danger zone.

## Exported hook

`useSettingsTabStyles()` — returns Griffel style classes object with the
following keys:

| Class | Purpose |
|---|---|
| `section` | Wrapper for a tab's content. `marginBottom: 32px`. |
| `sectionTitle` | Tab section heading. `fontSize: 13px`, `fontWeight: 700`, `color: colorText`, `marginBottom: 4px`. |
| `sectionDesc` | Section description text. `fontSize: 12px`, `color: colorTextMuted`, `lineHeight: 1.6`, `marginBottom: 14px`. |
| `label` | Form input label. `fontSize: 10px`, `fontWeight: 700`, `letterSpacing: 0.12em`, `textTransform: uppercase`, `color: colorTextFaint`, `marginBottom: 6px`. |
| `input` | Text input field. `width: 100%`, `padding: 9px 12px`, `backgroundColor: colorSurface2`, `border: 1px solid colorBorder`, `borderRadius: radiusSm`. Focus: `border: 1px solid colorGreen`. `::placeholder` color: `colorTextFaint`. |
| `btn` | Primary action button. `padding: 8px 16px`, `backgroundColor: colorGreen`, `border: 1px solid colorGreen`, `borderRadius: radiusSm`, `color: colorGreenInk`, `fontSize: 12px`, `fontWeight: 700`. Hover: `backgroundColor: colorGreenDeep`, border darkens. Disabled: `opacity: 0.5`. `marginTop: 10px`. |
| `successMsg` | Success feedback text. `fontSize: 11px`, `color: colorGreen`, `marginTop: 8px`. |
| `dangerZone` | Container for destructive actions. `border: 1px solid colorRed`, `borderRadius: radiusMd`, `padding: 16px`, `backgroundColor: rgba(255, 93, 108, 0.04)` (red tint). |
| `dangerTitle` | Danger zone heading. `fontSize: 12px`, `fontWeight: 700`, `color: colorRed`, `marginBottom: 8px`. |
| `dangerDesc` | Danger zone description. `fontSize: 11px`, `color: colorTextMuted`, `lineHeight: 1.6`, `marginBottom: 12px`. |
| `btnDanger` | Danger button (currently disabled). `padding: 7px 14px`, `border: 1px solid colorRed`, `color: colorRed`, `fontSize: 12px`, `fontWeight: 600`, `cursor: not-allowed`, `opacity: 0.5`. |

## Behaviour

All tabs import and call `useSettingsTabStyles()` at render time. Griffel
injects classes into the document on first use. No hydration or server-side
concerns; styles are component-local.

## Data

No Relay dependencies or data queries. Pure styling utilities.

## Notes

- Consolidates form styling (inputs, buttons, labels) and danger-zone treatment
  in one place to avoid redundancy across LibraryTab, FlagsTab, MetadataTab,
  DangerTab.
- TraceHistoryTab has its own `useTraceHistoryStyles()` for table/trace-specific
  styling (see `TraceHistoryTab.md`).
- Button colours (colorGreen, colorGreenDeep) and danger (colorRed) are sourced
  from `~/styles/tokens.js`.
