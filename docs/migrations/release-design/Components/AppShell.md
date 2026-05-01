# AppShell

> Status: **baseline** (Spec) · **not started** (Production)

## Files

- `design/Release/src/components/Layout/AppShell.tsx`
- `design/Release/src/components/Layout/AppShell.styles.ts`
- Prerelease behavioural reference: `design/Prerelease/src/components/Layout/`

## Purpose

The two-row, two-column shell that hosts the header, sidebar, and routed page. Wraps every shelled page (Profiles, Library, Settings, DesignSystem, NotFound). The Player and Goodbye pages bypass it.

## Visual

- Grid:
  - `gridTemplateColumns: ${tokens.sidebarWidth} 1fr` (220px sidebar + flexible main)
  - `gridTemplateRows: ${tokens.headerHeight} 1fr` (52px header + flexible main)
  - `gridTemplateAreas: "head head" "side main"` (header spans both columns)
- Dimensions: `width: 100vw`, `height: 100vh`, `overflow: hidden`.
- `backgroundColor: tokens.colorBg0` (`#050706`).
- `color: tokens.colorText` (`#e8eee8`).
- `position: relative` (so descendant absolutes anchor here).

## Behaviour

- Composition only — renders `<AppHeader>`, `<Sidebar>`, then `<main className={s.main}>{children}</main>`.
- `main` has `gridArea: main`, `overflow: hidden`, `position: relative` so pages can manage their own scroll/overlay positioning.

## Subcomponents

None.

## TODO(redesign)

- The header sits in its own grid row, so `backdrop-filter` on the header is cosmetic only — nothing actually shows through. If true overlay-glass is desired, drop the head row and absolute-position the header (sidebar/main need a `padding-top: ${headerHeight}` adjustment).

## Porting checklist (`client/src/components/Layout/AppShell/`)

- [ ] Grid template — 220px sidebar + 52px header + areas `"head head" "side main"`
- [ ] Full-viewport (100vw × 100vh), `overflow: hidden`
- [ ] `colorBg0` background, `colorText` foreground
- [ ] `position: relative` on the shell so descendants can `position: absolute`
- [ ] Composition: `<AppHeader>`, `<Sidebar>`, `<main>` slot
- [ ] `main` gets `overflow: hidden`, `position: relative` (each page handles its own scroll)

## Status

- [ ] Designed in `design/Release` lab (baseline reflects current state)
- [ ] Production implementation
