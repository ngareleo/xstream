# AppHeader

Top header strip — brand wordmark on the left, three centred navigation links, and a right cluster (icon-only scan button + avatar). Floats over the page content as a `position: absolute` layer inside `AppShell`. The header's backdrop-filter blur acts on real page content — most notably the Library hero's poster image ("poster behind glass").

**Source:** `client/src/components/app-header/`
**Used by:** `AppShell` (positioned over all pages).

## Role

Sticky header floating above viewport content. Renders brand identity, navigation routing (Home, Profiles, Watchlist), library scan trigger, and user account menu. All styling supports a glass effect with blur and backdrop saturation over whatever page content lies behind y=0.

## Props

| Prop | Type | Notes |
|---|---|---|
| `scanning` | `boolean` | Triggers spin animation on scan icon + aria-busy state. |
| `user` | `{ initials: string; name: string; email: string }` | User identity (hardcoded for now; Relay viewer fragment pending). |
| `onScan` | `() => void` | Scan button click handler. |

## Layout & styles

### Header container

- `position: absolute`, `top: 0`, `left: 0`, `right: 0`, `height: tokens.headerHeight` (52px), `zIndex: 10`.
- Three-column CSS grid: `gridTemplateColumns: 1fr auto 1fr`.
- `display: grid`, `alignItems: center`.

### Background layer (`.headerBg`)

- **CRITICAL:** Chrome lives on a **separate sibling** `<div className={s.headerBg} aria-hidden="true" />`, not on `<header>` itself. This prevents `mask-image` from clipping descendant popovers.
- `.headerBg` rules:
  - `position: absolute`, `inset: 0`, `zIndex: -1`, `pointerEvents: none`.
  - `backgroundImage: linear-gradient(180deg, rgba(20,28,24,0.55) 0%, rgba(8,11,10,0.78) 100%)`.
  - `backgroundColor: rgba(8,11,10,0.62)` (fallback).
  - `backdropFilter: blur(20px) saturate(1.6)` (+ `-webkit-` prefix).
  - `borderBottom: 1px solid rgba(37,48,42,0.45)`.
  - `boxShadow: inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(0,0,0,0.18), 0 6px 22px rgba(0,0,0,0.42)`.
  - Optional `maskImage: linear-gradient(to bottom, #000 0%, #000 60%, transparent 100%)` (+ `-webkit-` prefix) for soft bottom fade.

### Brand cell (left column, `paddingLeft: 24px`, `paddingRight: 24px`, `justifySelf: start`)

- `<Link to="/">` with `aria-label="Xstream — home"`.
- Inline-flex, `alignItems: baseline`.
- **Bytesized**, 34px, `letterSpacing: 0.04em`, `lineHeight: 1`.
- Two spans:
  - `<span className={s.brandX}>X</span>` — `color: tokens.colorGreen`, `textShadow: 0 0 12px ${tokens.colorGreenGlow}`.
  - `<span className={s.brandWord}>stream</span>` — `color: tokens.colorText`.

### Nav links (centre column, `justifySelf: center`, `columnGap: 32px`)

- Three `<NavLink>` elements: **Home** (`/` with `end` prop), **Profiles** (`/profiles`), **Watchlist** (`/watchlist`).
- **Science Gothic**, 12px, `letterSpacing: 0.04em`, `text-transform: lowercase`.
- `paddingTop: 6px`, `paddingBottom: 6px`, `position: relative` (for `::after` pseudo-element anchor).
- At rest: `color: tokens.colorTextDim`. Hover: `color: tokens.colorText` (transition `color, text-shadow`).
- **Active state** (`navLinkActive`): `color: tokens.colorGreen`, `textShadow: 0 0 10px ${tokens.colorGreenGlow}`.
- **`::after` underline:**
  - `content: ""`, `position: absolute`, `left: 0`, `right: 0`, `bottom: -2px`, `height: 2px`, `backgroundColor: tokens.colorGreen`.
  - At rest: `transform: scaleX(0)`, `transformOrigin: center`.
  - Active: `transform: scaleX(1)`.
  - Transition: `transform 0.15s`.

### Right cluster (right column, `justifySelf: end`, `paddingLeft: 24px`, `paddingRight: 24px`)

- `display: flex`, `gap: 12px`, `alignItems: center`.

#### Scan button

- 38×38, transparent bg, no border, no padding.
- Contains `<span className={s.scanIcon}><IconRefresh 22×22></span>`.
- `color: tokens.colorTextMuted` at rest; hover: `color: tokens.colorGreen`, `textShadow: 0 0 6px green, 0 0 16px greenGlow` (transition `color, text-shadow`).
- `aria-label`: `"Scanning library"` while scanning, `"Scan library"` otherwise.
- `aria-busy={scanning}`.
- While scanning, `.scanIcon` gets `animationName: { to: { transform: "rotate(360deg)" } }`, `1.1s linear infinite`.

#### Avatar & Account Menu

- 34×34 button, `border-radius: 50%` (circular).
- `backgroundImage: linear-gradient(140deg, ${colorGreenDeep}, ${colorGreen})`, `color: tokens.colorGreenInk`, font-weight 700.
- Displays `user.initials` (two-letter string).
- Wrapped in `accountWrap` div (position context for the dropdown).
- On menu open, avatar gets `avatarOpen` class: `borderColor: colorGreen`, `boxShadow: 0 0 8px colorGreen, 0 0 16px colorGreenGlow` (transition `box-shadow`).
- Click avatar to open; click outside or press ESC to close.
- Renders `<AccountMenu initials={} name={} email={} onSettings={() => navigate("/settings")} onSignOut={() => navigate("/goodbye")} />` conditionally.

## Behaviour

### Nav active state

React Router's `<NavLink>` manages active state. The `::after` underline scales in/out via CSS transform. The `end` prop on the `/` link prevents it from staying active on child routes.

### Scan button

Calls `handleScan()`. If already scanning, no-op. Sets `scanning = true`, then `setTimeout(() => setScanning(false), 2000)`. Icon gets the spinning class.

## Notes

Outstanding work tracked in [`Outstanding-Work.md`](../../release/Outstanding-Work.md#app-header).

## Tokens used

- `tokens.fontDisplay` — `"'Bytesized', system-ui, sans-serif"` (brand wordmark).
- `tokens.fontNav` — `"'Science Gothic', system-ui, sans-serif"` (nav links).
- `tokens.fontMono` — avatar initials font.
- `tokens.headerHeight` — `"52px"`.
- Google Fonts `<link>` in HTML `<head>` loads: Anton, Bytesized, Inter, JetBrains Mono, Science Gothic.
