# Logo

> Status: **baseline** (Spec) · **not started** (Production)

## Files

- `design/Release/src/components/Logo/Logo01.tsx` … `Logo07.tsx` — 7 candidate marks
- `design/Release/src/components/Logo/index.tsx` — exports, `LOGOS` array, `LogoCard`

## Purpose

Logo selection sandbox. Seven candidate marks render in `/design-system` for in-context review; the user picks one before production.

The `LogoCard` renders any candidate as a 360px-min boxed card with code + title + notes; the `highlighted` variant flags the working default.

## Visual

### `LOGOS` array (in `index.tsx`)

| code | num | title | notes |
|---|---|---|---|
| WM-01 | 01 | Anton + chevron mark | Compact lockup. Chevrons hint at FFWD / streams. |
| **MK-02** | 02 | **Stacked X monogram** | **Currently the working default.** Standalone mark for app icon, favicon, splash. |
| WM-03 | 03 | Signal-bar X + tagline | Cinema bars form X — tech + film hybrid. |
| WM-04 | 04 | Cinematic display lockup | Custom X letterform. Marquee feel. Use big. |
| WM-05 | 05 | Frame strip | Each letter as a frame. Editorial, archival. |
| WM-06 | 06 | Slashed condensed | Self-hosted, dev-confident. Scales down well. |
| WM-07 | 07 | Bracketed monogram | Quietest option. Brackets reference TUI / CLI. |

`LogoEntry` shape:
```ts
interface LogoEntry {
  code: string;
  num: string;
  title: string;
  notes: string;
  render: () => ReactNode;
}
```

### `LogoCard`
- Container: `background: var(--surface)`, `borderRadius: 4`, `padding: 32px 28px 22px`, `min-height: 360px`, `position: relative`, `overflow: hidden`.
- Border default: `1px solid var(--border)`. When `highlighted`: `1px solid var(--green)` + `boxShadow: 0 0 0 3px var(--green-soft)`.
- Top-left badge: `entry.code` in JetBrains Mono 10px / 0.18em / uppercase / `text-faint`.
- Top-right (when `highlighted`): `● DEFAULT` in Mono 9px / 0.2em / `var(--green)`.
- Mark area: flex centred, `padding: 28px 0`, calls `entry.render()`.
- Footer row: top border `1px solid var(--border-soft)`, `padding-top: 12px`, `margin-top: 12px`.
  - Left: `{num} / {title}` in Mono 11px / `color: var(--text-dim)` / 0.06em.
  - Right: `{notes}` in 10px / `color: var(--text-muted)` / max-width 60% / right-aligned.

## Behaviour

- Pure presentation. No state, no animation.
- `Logo02` is also imported standalone by `pages/Goodbye/Goodbye.tsx` as the brand glyph during sign-out.

## Subcomponents

None — each `LogoNN.tsx` is a standalone SVG.

## TODO(redesign)

- The "current default" is hard-coded as `Logo02` in `pages/DesignSystem/DesignSystem.tsx` (passes `highlighted={entry.code === "MK-02"}`). When the user picks a final, this needs:
  - Update the `highlighted` predicate (or move the flag onto `LogoEntry` itself).
  - Replace the `<span>X</span>` brand glyph in `AppHeader.tsx` with a `<Logo02 />`-style glyph + wordmark lockup if the chosen mark is glyph + wordmark.
  - Delete the rejected `LogoNN.tsx` files and prune the `LOGOS` array.

## Porting checklist (`client/src/components/Logo/`)

- [ ] Once user picks final mark: ship only the chosen `LogoNN.tsx` (delete the rest)
- [ ] Update `AppHeader` brand glyph if a glyph + wordmark lockup was chosen
- [ ] Update `Goodbye` page logo import if a different mark was picked
- [ ] Remove `LogoCard` and `LOGOS` array (lab-only — DesignSystem stays in lab)
- [ ] Production logo gets `aria-label="Xstream"` and a sized `viewBox`

## Status

- [ ] Designed in `design/Release` lab (baseline — selection still pending)
- [ ] Production implementation
