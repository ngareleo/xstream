# AuthLayout

Shared full-screen route layout for the unauthenticated entry-point
pages (`/signin`, `/signup`, `/reset-password`). Bypasses `AppShell`.
Renders the cinematic chrome **once** — the full-bleed hero image,
darkening scrim, grain overlay, the brand wordmark in the top-left, and
the right-anchored translucent "glass" panel — and exposes the panel
interior as an `<Outlet />`. Children-route components render their own
eyebrow / title / subtitle / form inside the outlet, so navigating
between the three auth routes does **not** unmount the hero or the
panel.

**Source:** `client/src/components/auth-layout/`
**Used by:** Registered as the `element` of a parent route in
`client/src/router.tsx`; the three auth pages are nested as `children`.

## Role

Visual chrome + route layout. Owns the viewport (100vw × 100vh), the
hero `<img>`, and the layered atmosphere (image, scrim, grain, panel
glow). Provides an outlet inside the glass panel so the hero never
re-mounts when the user moves between sign-in, sign-up, and reset.
Ships no behaviour beyond rendering and outlet composition.

## Props

None — registered as a route layout. Used as
`<Route element={<AuthLayout />}>` with the three auth page routes as
children.

## Layout & styles

### Outer container (`shell`)

- `position: relative`, `width: 100vw`, `height: 100vh`,
  `overflow: hidden`, `backgroundColor: colorBg0`, `color: colorText`,
  `fontFamily: fontBody`.

### Hero image (`hero`)

- `<img src="/hero-auth.webp">`, absolute fill, `objectFit: cover`,
  `objectPosition: "center 35%"`, `filter: saturate(0.92) brightness(0.85)`,
  `transform: scale(1.02)` (subtle zoom, no animation).

### Scrim (`scrim`)

Absolute fill, two stacked gradients:

```
linear-gradient(180deg, rgba(5,7,6,0.55) 0%, rgba(5,7,6,0) 22%, rgba(5,7,6,0) 55%, rgba(5,7,6,0.7) 100%)
linear-gradient(270deg, rgba(5,7,6,0.92) 0%, rgba(5,7,6,0.6) 30%, rgba(5,7,6,0.05) 65%, rgba(5,7,6,0) 100%)
```

Top/bottom soften the image; the right edge fades to near-black so the
glass panel rides on a calm background.

### Grain (`grain`)

Shared `.grain-layer` utility (see `client/src/styles/shared.css`),
`opacity: 0.18`.

### Brand mark (`brand`)

- Top-left, `top: 28px`, `left: 32px`, `zIndex: 3`, `pointerEvents: none`.
- `<Logo02 size={28} showWordmark={false} />` + `XSTREAM` wordmark
  (Mono 11px, `letter-spacing: 0.32em`, uppercase, `colorTextDim`).

### Panel wrap (`panelWrap`)

- Flex container filling the shell (`zIndex: 2`).
- `alignItems: center`, `justifyContent: flex-end`, padding
  `32px 8vw 32px 32px` (right-anchored).

### Glass panel (`panel`)

- `width: 100%`, `maxWidth: 420px`, padding `40px 36px 36px 36px`.
- `backgroundColor: rgba(10, 13, 12, 0.62)`, 1 px solid
  `colorBorderSoft` border, `borderRadius: radiusMd`.
- `backdropFilter: blur(18px) saturate(1.2)` (Webkit prefix included).
- `boxShadow: 0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.02) inset, 0 0 60px colorGreenSoft`
  — depth + a soft green rim glow.
- Hosts a single `<Outlet />`. Pages render their eyebrow / title /
  subtitle / form directly into the outlet using the panel's typography
  styles (see "Typography helpers" below).

### Typography helpers (exported via `useAuthLayoutStyles()`)

These class hooks live on the same Griffel hook the layout uses, so
each page can call `useAuthLayoutStyles()` and apply them to its own
header elements. They are *not* rendered by `AuthLayout` itself any
more — pages own their copy:

- **`eyebrow`**: Mono 11px, `letter-spacing: 0.22em`, uppercase,
  `colorGreen`, `marginBottom: 10px`.
- **`title`**: Anton 44px, `lineHeight: 0.98`, uppercase,
  `marginBottom: 10px`.
- **`subtitle`**: Body 13px, `lineHeight: 1.5`, `colorTextDim`,
  `marginBottom: 28px`.

## Behaviour

None — pure presentational layout. No effects, no event dispatchers,
no Relay queries.

### Why an outlet, not props

An earlier revision exposed `eyebrow`, `title`, `subtitle`, `children`
as props and was inlined per-page. That made every navigation between
the three routes unmount and remount the entire `AuthLayout`,
including the `<img>` (visible flash). The current outlet form keeps
the chrome stable; only the panel interior swaps.

## Asset

The hero is served from `client/public/hero-auth.webp` (no bundler
import; referenced by absolute `/hero-auth.webp` URL via the
`heroSrc` constant exported alongside the styles hook). Single image
shared across all three auth pages.

## Notes

- **No AppShell, no Suspense fallback at the layout level** — pages
  bypass the shelled router layout entirely. The parent `Suspense`
  wraps `<AuthLayout />` itself; each child route also wraps its
  page in its own `Suspense fallback={null}` so a slow chunk for one
  page doesn't blank out the chrome.
- **Backend wiring** is intentionally absent; the auth pages are a UI
  scaffold awaiting an identity feature.
