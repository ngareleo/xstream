# SettingsToggle

38×20 green switch toggle for boolean settings. Slides a knob left (off) or
right (on); renders as a `<button role="switch">` with `aria-checked` for
accessibility.

**Source:** `client/src/components/settings-toggle/`
**Used by:** FlagsTab (boolean flag toggles); ready for adoption by other
boolean settings (e.g., user preferences).

## Role

Reusable boolean control. Standard on/off two-state switch with keyboard and
mouse support.

## Props

| Prop | Type | Notes |
|---|---|---|
| `on` | `boolean` | Current state. |
| `onChange` | `(next: boolean) => void` | State change callback. |
| `ariaLabel` | `string?` | Accessibility label for the button. |
| `disabled` | `boolean?` | Disables click and dims at `opacity: 0.5`. Default `false`. |

## Layout & styles

### Track

- `width: 38px`, `height: 20px`, `borderRadius: radiusFull` (rounded pill).
- **Off state**: `backgroundColor: colorSurface2`, `border: 1px solid colorBorder`.
- **On state**: `backgroundColor: colorGreen`, `border: 1px solid colorGreen`.
- Transitions: `background-color, border-color` at `tokens.transition`.
- `cursor: pointer`.

### Knob

- `width: 14px`, `height: 14px`, `borderRadius: radiusFull` (circle).
- Position: `top: 2px`, off → `left: 2px`, on → `left: 20px`.
- **Off state**: `backgroundColor: colorTextDim`.
- **On state**: `backgroundColor: colorGreenInk`.
- Transitions: `left, background-color` at `tokens.transition`.

### Disabled

- When `disabled` is true: `opacity: 0.5`, `cursor: not-allowed`.

## Behaviour

- Renders as `<button type="button" role="switch">` with `aria-checked={on}`.
- Click toggles the boolean and fires `onChange(!on)`.
- Keyboard: Enter/Space toggle the state (native button behaviour).
- Disabled buttons do not respond to click.

## Data

No Relay fragments. State is passed by parent (typically FlagsTab).

## Notes

- Storybook coverage in `SettingsToggle.stories.tsx` exercises Off, On, and
  Disabled states.
- Pattern is applied in FlagsTab to toggle boolean flags; extends to any
  boolean setting in future.
