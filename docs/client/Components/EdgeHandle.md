# EdgeHandle

A right-edge magnetic handle button that sits tucked behind the viewport's right edge by default and bulges into view as the cursor approaches. Used as a drawer-trigger pattern without taking up permanent space.

**Source:** `client/src/components/edge-handle/`
**Used by:** `Player` (right side-panel trigger); reusable for any page with a right-anchored drawer.

## Role

Stateless proximity trigger for opening a drawer or side-panel. The component self-hides when the cursor is outside the detection zone. The parent controls visibility (typically with conditional render) and handles opening the drawer via the `onActivate` callback.

## Props

| Prop | Type | Notes |
|---|---|---|
| `cursorX` | `number` | Last `clientX` from the parent's `onMouseMove`. |
| `cursorY` | `number` | Last `clientY` from the parent's `onMouseMove`. |
| `onActivate` | `() => void` | Fires on click; parent handles opening the drawer. |

**Exported constant:** `EDGE_DETECTION_ZONE_PX = 140`.

## Layout & styles

### Glass disc base

- `position: absolute`, `right: -22px` — half the disc is tucked behind the viewport's right edge.
- 44 × 44 px circle, `borderRadius: 999px`. All four borders are real.
- Translucent white bg `rgba(255,255,255,0.10)`, beveled-light borders (top brighter than bottom).
- `backdropFilter: blur(20px) saturate(180%)`, layered shadows:
  - `inset 0 1px 0 rgba(255,255,255,0.30)` (top highlight)
  - `inset 0 -1px 0 rgba(0,0,0,0.20)` (bottom shade)
  - `-8px 0 28px rgba(0,0,0,0.45)` (ambient leftward).
- `transformOrigin: right center`. `zIndex: 15`. `willChange: transform, top, opacity`.
- Single chevron `‹` glyph centered (16px monospace, white, `translateX(-7px)` so it points inward from the visible half of the disc).
- `:hover` — brightens bg to `rgba(255,255,255,0.18)`, amplifies the ambient shadow, adds `0 0 24px rgba(255,255,255,0.10)` halo.

## Behaviour

### Proximity math

Computed every render from `cursorX, cursorY`:

| Quantity | Formula |
|---|---|
| `distFromEdge` | `max(0, innerWidth − cursorX)` |
| `bulge` | `clamp(1 − distFromEdge / 140, 0, 1)` |
| `eased` | `bulge² · (3 − 2·bulge)` (smoothstep S-curve) |
| `translateX` | `(1 − eased) · 44` px (fully tucked at `eased=0`; half visible at `eased=1`) |
| `scale` | `0.92 + eased · 0.08` (uniform — no horizontal stretch / vertical squish) |
| `top` | `clamp(cursorY, 30, innerHeight − 30)` (handle half-height = 22; +8 padding) |
| `opacity` | `eased` |
| `pointerEvents` | `"auto"` if `eased > 0.08`, else `"none"` |

Inline `style` carries `top`, `transform`, `opacity`, `pointerEvents` so values update every render in lockstep with the cursor. The Griffel base class transitions `background-color, box-shadow` only (0.18s) — `transform` and `top` are NOT transitioned (track the cursor instantly).

### Accessibility

- `aria-label="Open side panel"`.
- `aria-hidden={!interactive}` and `tabIndex={interactive ? 0 : -1}` flip together based on `eased > 0.08`, so the handle is keyboard- and AT-inert when not visible.
- Click handler does `e.stopPropagation()` so the parent's wake/inactivity handler doesn't double-fire.

## Data

No data dependencies — all input is cursor position from parent and emit via callback.

## Notes

The handle is a reusable pattern; any page with a right-anchored drawer can wrap it in a visibility container and wire `onActivate` to its open handler.
