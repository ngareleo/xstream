# SettingsSelector

Button-style enum selector. Displays a value with a chevron (▾) dropdown
indicator. Currently rendered as a decorative display (no live dropdown
consumer); ready for adoption when enum selection is needed.

**Source:** `client/src/components/settings-selector/`
**Used by:** None in production. Primitives available for future enum controls.

## Role

Reusable enum selector surface. Visually distinct from SettingsToggle and
SettingsRow controls; auto-disables when no `onClick` handler is provided.

## Props

| Prop | Type | Notes |
|---|---|---|
| `value` | `string` | Displayed value (e.g., "MATCH SOURCE", "VAAPI"). |
| `onClick` | `() => void?` | Click handler. If omitted, button auto-disables. |
| `ariaLabel` | `string?` | Accessibility label. |
| `disabled` | `boolean?` | Explicit disable. Default `false`. |

## Layout & styles

### Button

- `display: inline-flex`, `alignItems: center`, `gap: 6px`.
- `padding: 6px 12px`.
- `backgroundColor: colorSurface2`, `border: 1px solid colorBorder`,
  `borderRadius: radiusSm`.
- Font: `fontMono`, `11px`, `letterSpacing: 0.08em`.
- `color: colorText`.
- Hover (when not disabled): `borderColor: colorGreen`.
- Disabled: `cursor: default`.
- Transitions: `border-color, background-color` at `tokens.transition`.

### Content

- **Value** — `flexGrow: 1`, `textAlign: left`, renders the passed string.
- **Chevron** — `aria-hidden="true"`, `color: colorTextMuted`, renders as `▾`.

## Behaviour

- Renders as `<button type="button">`.
- Click fires `onClick()` if provided; otherwise button is disabled.
- Auto-disables when `onClick` is undefined (interior `disabled ||
  onClick === undefined` logic).
- No dropdown behaviour in component — parent owns menu state/rendering.

## Data

No Relay fragments. Value and onClick are passed by parent.

## Notes

- Storybook coverage in `SettingsSelector.stories.tsx` exercises Default
  (clickable), Masked (obscured value, e.g. API key), and Decorative (disabled,
  display-only) variants.
- Component is a primitive ready to be wrapped by a dropdown menu when enum
  selection is needed.
