# AppShell

> Status: **done** (Spec) · **not started** (Production) · last design change **2026-05-01** (PR #46 commit 5301df6)

## Files

- `design/Release/src/components/Layout/AppShell.tsx`
- `design/Release/src/components/Layout/AppShell.styles.ts`
- Prerelease behavioural reference: `design/Prerelease/src/components/Layout/`

## Purpose

Full-viewport shell that hosts the header and routed page content. Wraps every shelled page (Home/Library, Profiles, Watchlist, Settings, DesignSystem, NotFound). The Player and Goodbye pages bypass it. **The header is now `position: absolute` over the main content — there is no grid.** Every page sits at viewport y=0 by default; each page is responsible for its own header-clearance padding.

## Visual

- `.shell`: `position: relative`, `width: 100vw`, `height: 100vh`, `overflowX: hidden`, `overflowY: hidden`. No grid.
  - `backgroundColor: tokens.colorBg0` (`#050706`).
  - `color: tokens.colorText` (`#e8eee8`).
- `.main`: `position: absolute`, `top: 0`, `left: 0`, `right: 0`, `bottom: 0`, `overflow: hidden`.

The header (see [`AppHeader.md`](AppHeader.md)) is also `position: absolute`, layered over `.main`. Because both occupy the same absolute inset, the page content begins at viewport y=0 and extends behind the header's backdrop-filter blur.

## Behaviour

- Composition only — renders `<AppHeader>` then `<main className={s.main}>{children}</main>`.
- `<AppHeader>` and `<main>` both sit at `inset: 0`; the header is on top via `zIndex: 10`.
- `<Sidebar>` is no longer rendered here. Navigation lives in `<AppHeader>`.
- Each page inside `<main>` is responsible for clearing the header by adding `paddingTop: tokens.headerHeight` (or `calc(${tokens.headerHeight} + N)`) to its outermost container. No shared padding is applied by the shell.

## Subcomponents

None.

## What changed from the prior spec (787f136 → 5301df6)

The prior spec (787f136) described a single-column grid:
- `gridTemplateColumns: 1fr`
- `gridTemplateRows: ${tokens.headerHeight} 1fr`
- `gridTemplateAreas: '"head" "main"'`
- `main` had `gridArea: main`

All of that is superseded. The shell is now a positioned-layer model: shell `position: relative`, `main` `position: absolute inset: 0`, header `position: absolute inset: top/left/right`. The Library hero is the primary beneficiary — it now renders edge-to-edge from viewport y=0, with the glass header blurring whatever content appears behind it ("poster behind glass").

The prior note about `TODO(redesign)` overlay-glass is now resolved — this commit is that iteration.

## Changes from Prerelease

- **Shell layout model:** Prerelease used a CSS grid (`gridTemplateRows: 52px 1fr`, `gridTemplateColumns: 220px 1fr`, `gridTemplateAreas: '"header header" "sidebar main"'`). Release uses a positioned-layer model — `.shell` is `position: relative`, `.main` is `position: absolute inset: 0`, `<AppHeader>` is `position: absolute top/left/right height: 52px zIndex: 10`. No grid anywhere.
- **Sidebar removed:** Prerelease AppShell rendered `<Sidebar>` as a direct child and managed the `collapsed` state. Release AppShell renders only `<AppHeader>` (absolute) and `<main>` (absolute). Sidebar is deleted.
- **Header clearance:** Prerelease reserved the first grid row for the header — pages got `gridArea: main` and started below the 52px strip automatically. Release shifts that responsibility to each page: every page must add `paddingTop: tokens.headerHeight` (or a `calc(...)` variant) to its outermost container.
- **Header-blur target:** Because both header and main share `inset: 0`, the header's `backdropFilter: blur(20px) saturate(1.6)` now blurs actual page content (e.g. the Library hero poster) rather than the shell's background colour. This produces the "poster behind glass" effect on the Library page.
- **LoadingBar / DevPanel removed:** Prerelease AppShell wrapped children in `<DevToolsProvider>` + `<LoadingBarProvider>`, rendered `<LoadingBar>` and `<DevPanel>`. These are absent from the Release shell.
- **`collapsed` state removed:** The sidebar-collapse boolean and the `rootCollapsed` style class do not exist in Release.

## Porting checklist (`client/src/components/Layout/AppShell/`)

- [ ] `.shell`: `position: relative`, full-viewport (100vw × 100vh), `overflow: hidden`, `colorBg0` bg, `colorText` color. No grid.
- [ ] `.main`: `position: absolute`, `top: 0`, `left: 0`, `right: 0`, `bottom: 0`, `overflow: hidden`
- [ ] Composition: `<AppHeader>` (absolute, z=10) + `<main>` slot (absolute, inset 0). No `<Sidebar>`.
- [ ] No header-clearance padding on the shell. Each page manages its own `paddingTop`.

## Status

- [x] Designed in `design/Release` lab — sidebar removed, single-column grid (2026-05-01, PR #46 commit 787f136). Grid replaced with positioned-layer model — shell `relative`, main `absolute inset:0`, header `absolute top/left/right` (2026-05-01, PR #46 commit 5301df6). PR #46 on `feat/release-design-omdb-griffel`, not yet merged to main.
- [ ] Production implementation
