# SettingsRow

Grid-based label + control row for settings forms. Pairs a left-side label
and optional hint text with a right-aligned control element. Used throughout
the Settings page tabs.

**Source:** `client/src/components/settings-row/`
**Used by:** All Settings page tabs (LibraryTab, FlagsTab, MetadataTab, etc.).

## Role

Reusable settings form row primitive. Enforces consistent label/hint/control
layout and spacing across all settings sections. The component is purely
presentational — tab components own state and pass controls (toggles, buttons,
inputs) as children.

## Props

| Prop | Type | Notes |
|---|---|---|
| `label` | `string` | Row label text. Required. |
| `hint` | `string?` | Optional secondary hint text below the label. |
| `control` | `ReactNode` | Any element: toggle, button, input, selector. Rendered right-aligned. |

## Layout & styles

### Container

- `display: grid`, `gridTemplateColumns: "1fr auto"`, `alignItems: center`.
- `columnGap: 16px`.
- `paddingTop: 14px`, `paddingBottom: 14px`.
- `borderBottom: 1px solid colorBorderSoft`.

### Left section (meta)

- `minWidth: 0` (allows label/hint ellipsis).
- **Label** — `fontSize: 13px`, `color: colorText`.
- **Hint** (if present) — `fontSize: 11px`, `color: colorTextMuted`,
  `marginTop: 4px`, `lineHeight: 1.5`.

### Right section (control)

- `flexShrink: 0` (control never shrinks).
- Right-aligned via grid column 2.

## Behaviour

- Renders as a `<div>` with two nested flex columns (`meta`, `control`).
- Hint only renders when `hint` is defined; its absence removes the div from
  the DOM.
- No click handlers or state — parent tabs own all interactivity.
- Text overflow: label and hint ellipsis naturally via parent `minWidth: 0`.

## Data

No Relay fragments. Props are passed by parent tabs.

## Notes

- Storybook coverage in `SettingsRow.stories.tsx` exercises both the Default
  (no hint) and WithHint (hint present) variants.
- Pattern is symmetric with AccountMenu's identity row structure — same
  minWidth/ellipsis discipline for overflow text.
