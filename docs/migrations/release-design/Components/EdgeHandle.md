# EdgeHandle

> Status: **done** (Spec) · **not started** (Production)
> Spec updated: 2026-05-02 — switched from a vertical lozenge (30×108 px, half-pill on the right edge) to a circular disc (44×44 px, half-tucked behind the right edge). Proximity math simplified to a uniform scale; chevron offset to point inward from the visible half.
> Spec created: 2026-05-02 — extracted from inline JSX in `Player.tsx` into its own reusable component. First consumer: Player (right side-drawer trigger).

## Files

- `design/Release/src/components/EdgeHandle/EdgeHandle.tsx`
- `design/Release/src/components/EdgeHandle/EdgeHandle.styles.ts`

## Purpose

A right-edge "magnetic" handle button that sits tucked behind the viewport's right edge by default and bulges into view as the cursor approaches. Designed to act as the trigger for a right-anchored drawer/side-panel without taking up space when not in use, and without needing a permanently visible chrome element.

Currently used by the [Player](Player.md) page to open the SidePanel; reusable by any page that wants the same drawer-trigger pattern.

## Public API

```ts
interface EdgeHandleProps {
  cursorX: number;       // last clientX from the parent's onMouseMove
  cursorY: number;       // last clientY from the parent's onMouseMove
  onActivate: () => void; // fired on click; parent handles opening the drawer
}

export const EDGE_DETECTION_ZONE_PX = 140; // exported constant
```

The component is **stateless and self-hiding**: render it whenever it should be eligible to appear, and it will fade itself out (`opacity: 0`, `pointer-events: none`, `tabIndex: -1`, `aria-hidden`) when the cursor is outside the detection zone. The parent does not need a "near edge" boolean.

## Visual base (Liquid Glass disc)

- `position: absolute`, `right: -22px` — half the disc is tucked behind the viewport's right edge so the affordance reads as "something to pull out", not a floating button.
- 44 × 44 px circle, `borderRadius: 999px`. All four borders are real (no longer the open-right pill).
- Translucent white bg `rgba(255,255,255,0.10)`, beveled-light borders (top brighter than bottom).
- `backdropFilter: blur(20px) saturate(180%)`, layered shadows: `inset 0 1px 0 rgba(255,255,255,0.30)` (top highlight) + `inset 0 -1px 0 rgba(0,0,0,0.20)` (bottom shade) + `-8px 0 28px rgba(0,0,0,0.45)` (ambient leftward).
- `transformOrigin: right center`. `zIndex: 15`. `willChange: transform, top, opacity`.
- Single chevron `‹` glyph centered (16px monospace, white, nudged `translateX(-7px)` so it points inward from the visible half of the disc rather than sitting dead-center under the off-screen edge).
- `:hover` brightens bg → `rgba(255,255,255,0.18)`, amplifies the ambient shadow, adds a `0 0 24px rgba(255,255,255,0.10)` halo.

## Proximity behaviour

Computed every render from `cursorX, cursorY`:

| Quantity | Formula |
|---|---|
| `distFromEdge` | `max(0, innerWidth − cursorX)` |
| `bulge` | `clamp(1 − distFromEdge / 140, 0, 1)` |
| `eased` | `bulge² · (3 − 2·bulge)` (smoothstep S-curve — the "wave" feel) |
| `translateX` | `(1 − eased) · 44` px (fully tucked at `eased=0`; half visible at `eased=1`, since `right: -22px` already exposes the inner half) |
| `scale` | `0.92 + eased · 0.08` (uniform — no horizontal stretch / vertical squish; the circular form keeps consistent proportions) |
| `top` | `clamp(cursorY, 30, innerHeight − 30)` (handle half-height = 22; +8 padding) |
| `opacity` | `eased` |
| `pointerEvents` | `"auto"` if `eased > 0.08`, else `"none"` |

Inline `style` carries `top`, `transform`, `opacity`, `pointerEvents` so the values update every render in lockstep with the cursor. The Griffel base class has a 0.18s transition on `background-color, box-shadow` only — transform and top are NOT transitioned (so they track the cursor instantly).

## Accessibility

- `aria-label="Open side panel"`.
- `aria-hidden={!interactive}` and `tabIndex={interactive ? 0 : -1}` flip together based on `eased > 0.08`, so the handle is keyboard- and AT-inert when it's not visible.
- The click handler does `e.stopPropagation()` so the parent's wake/inactivity handler doesn't double-fire on the same click.

## Porting checklist (`client/src/components/EdgeHandle/`)

- [ ] Reusable component, props: `cursorX, cursorY, onActivate`. Export `EDGE_DETECTION_ZONE_PX`.
- [ ] Glass disc base: 44×44 px circle (`borderRadius: 999px`, all four borders), `right: -22px` so half tucks behind the viewport edge, translucent white bg, beveled-light borders, `backdropFilter: blur(20px) saturate(180%)`, layered inset + ambient shadows.
- [ ] Single `‹` chevron glyph, monospace 16px, white, `translateX(-7px)` so it sits in the visible (left) half of the disc.
- [ ] Proximity math per the table above. Smoothstep ease. Uniform scale (no asymmetric stretch). Cursor-Y tracking with viewport clamp.
- [ ] Self-hides via inline `opacity` + `pointerEvents` + `aria-hidden` + `tabIndex` on the same `eased > 0.08` threshold.
- [ ] Click handler calls `onActivate` and `e.stopPropagation()`.
- [ ] No transitions on `transform` or `top` — the handle should track the cursor instantly. Only `background-color, box-shadow` get a 0.18s ease (for the hover state).

## Status

- [x] Designed in `design/Release` lab. 2026-05-02 — switched to circular disc form factor (44×44, half-tucked, uniform scale). Earlier same-day pass extracted from `Player.tsx` inline JSX.
- [ ] Production implementation
