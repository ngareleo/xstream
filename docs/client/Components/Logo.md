# Logo

Logo mark component currently rendering `Logo02` — a stylized X monogram rendered in Bytesized (the display font) and used in the system-chrome mark (favicon, desktop icon). **The logo does NOT appear inside the application UI** — the AppHeader wordmark is text-only and unchanged. This component is kept for historical reference and `GoodbyePage` fallback rendering.

**Source:** `client/src/components/logo/`
**Used by:** `GoodbyePage` (sign-out screen, deprecated; use icon system instead).
**System assets:** `client/public/favicon.svg` (256px SVG), `src-tauri/icons/` (generated PNG + icon sets for macOS/Windows via `tauri icon`).

## Role

Presentational SVG mark for fallback branding. `Logo02` is maintained as a React component for backward compatibility; the production logo is sourced from `icons/xstream-icon.svg` (a Bytesized X on a brand-green rounded square) and bundled as `favicon.svg` and platform-specific icon sets by the Tauri build process.

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

## System logo source

The production favicon and desktop-icon source is `client/public/favicon.svg`, which renders the finalized X-glyph logo (Bytesized display font, black ink on brand-green `oklch(0.78 0.20 150)` rounded square at 256px viewport size). For Tauri desktop builds, a 1024×1024px render is passed to `tauri icon` to generate all platform-specific icon sets (PNG 32/64/128/@2x, icon.icns, icon.ico); these are referenced in `src-tauri/tauri.conf.json` under `bundle.icon`. No direct React component renders the production logo inside the app — it appears only in system chrome (browser tabs, task manager, application menus).
