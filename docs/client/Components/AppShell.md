# AppShell

Full-viewport shell that hosts the header and routed page content. Wraps every shelled page (Home/Library, Profiles, Watchlist, Settings, DesignSystem, NotFound). The Player and Goodbye pages bypass it. The header is `position: absolute` over the main content; there is no grid. Every page sits at viewport y=0 by default; each page is responsible for its own header-clearance padding.

**Source:** `client/src/components/app-shell/`
**Used by:** Client router (wraps all main pages).

## Role

Thin presentational layer providing full-viewport layout structure. Renders `<AppHeader>` (positioned absolutely) over `<main>` (positioned absolutely, fills viewport). No sidebar. No shared padding — pages manage their own header clearance.

## Layout & styles

### Shell container (`.shell`)

- `position: relative`, `width: 100vw`, `height: 100vh`, `overflowX: hidden`, `overflowY: hidden`.
- `backgroundColor: tokens.colorBg0` (`#050706`).
- `color: tokens.colorText` (`#e8eee8`).
- No grid.

### Main content (`.main`)

- `position: absolute`, `top: 0`, `left: 0`, `right: 0`, `bottom: 0`, `overflow: hidden`.
- Hosts routed page children.

### Header

See [`AppHeader.md`](AppHeader.md). Positioned `absolute inset: 0`, `zIndex: 10`. Floats over `.main`.

## Behaviour

- Composition only — renders `<AppHeader>` then `<main className={s.main}>{children}</main>`.
- `<AppHeader>` and `<main>` both sit at `inset: 0`; the header is on top via `zIndex: 10`.
- Each page inside `<main>` is responsible for clearing the header by adding `paddingTop: tokens.headerHeight` (or `calc(${tokens.headerHeight} + N)`) to its outermost container.
- The header's `backdropFilter: blur(20px) saturate(1.6)` blurs the actual page content at y=0 (e.g. the Library hero poster).

## Notes

The positioned-layer model allows the header to blur real page content, producing the "poster behind glass" effect on the Library page. In contrast, a grid-row model would reserve space and prevent the overlay.
