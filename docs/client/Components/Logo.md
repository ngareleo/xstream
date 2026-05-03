# Logo

Logo mark component currently rendering `Logo02` — a stacked X monogram used as the app icon, favicon, and splash-screen mark. The design lab in `design/Release/` maintains seven candidate marks for future selection.

**Source:** `client/src/components/logo/`
**Used by:** `GoodbyePage` (sign-out screen), app icon and favicon (system).

## Role

Presentational SVG mark for app branding. `Logo02` is the working default — a compact circle outline with 6px square-cap diagonals and a 6px central node. The component is purely visual; no state or interaction.

## Props

| Prop | Type | Notes |
|---|---|---|
| `size` | `number` | Rendered width/height in pixels (square aspect). |
| `showWordmark` | `boolean` | If `true`, renders a text wordmark alongside (not currently used). Default: `false`. |

## Layout & styles

### Logo02 SVG

- `viewBox="0 0 120 120"` (square canvas).
- Circle outline stroke (green, no fill).
- Two diagonal lines (6px square caps) forming an X, anchored at the center.
- Central node (6px square, green).
- All strokes and fills driven by CSS custom properties mirrored from `tokens.ts` in `shared.css` (e.g., `var(--green*)` tokens).
- Scales uniformly via the `size` prop on width and height.

### Colors

- Outline, diagonals, node: all use `colorGreen` token.
- Transparent background (rendered in context).

## Behaviour

- Pure SVG render — no animation or state.
- `aria-label="Xstream"` for accessibility.
- Used in `GoodbyePage` with `size={64} showWordmark={false}` at `opacity: 0.6`.

## Data

No data dependencies.

## Notes

The design lab (`design/Release/src/components/Logo/`) maintains seven candidate marks (`Logo01`–`Logo07`) in a `LogoCard` selection sandbox. `Logo02` is the current working default shipped in production. When a final mark is chosen, the other candidates may be deleted and `Logo02` remains the canonical component, or production switches to the selected alternative.
