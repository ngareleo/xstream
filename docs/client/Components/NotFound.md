# NotFound (page)

404 error page rendered inside AppShell (sidebar + header still visible). A
centred message informing the user the page doesn't exist, with "Go back" and
"Browse library" CTAs.

**Source:** `client/src/pages/not-found-page/`
**Used by:** Router as `*` catch-all route inside the shelled app.

## Role

Fallback route for unmapped paths. Renders inside AppShell, so the sidebar and
header remain visible for navigation. Displays a centered 404 message with two
actions: navigate back or return to the library home.

## Props

None — the page is a route shell. No props required.

## Layout & styles

### Outer container (`.shell`)

- `height: 100%`, `position: relative`, `overflow: hidden`, `backgroundColor:
  colorBg0`.
- `display: flex`, centred (both axes).
- **`paddingTop: tokens.headerHeight`, `boxSizing: border-box`** — page manages
  header clearance so the centred content stays roughly mid-viewport (not hidden
  behind header).

### Layered atmosphere (bottom to top)

1. `.grain-layer` utility, `opacity: 0.2`.
2. Radial green glow: `radial-gradient(ellipse at center, colorGreenSoft 0%,
   transparent 60%)`, `pointerEvents: none`.
3. **Ghost numeral**: Font-size 32vw, Anton, `opacity: 0.04`,
   `letterSpacing: -0.04em`, content `"404"`. `aria-hidden`, no select/pointer.

### Centred content (z-index: 2, padding: 24)

- **Eyebrow**: Mono 11px uppercase `colorGreen` — `"· NOT FOUND"`.
- **Display title**: Anton 64px, `letterSpacing: -0.01em`, uppercase —
  `"Nothing here."`.
- **Body line**: `colorTextDim`, max-width 460, `marginTop: 8`, `marginInline:
  auto` — `"The page you tried to reach has moved or never existed. Head back
  to the library to keep browsing."`.
- **Action row** (`marginTop: 22`, `gap: 12`, centred):
  - **Go back button**: transparent bg, `border: 1px solid colorBorder`,
    `color: colorTextDim`, Mono 11px / `letterSpacing: 0.18em` / uppercase,
    `borderRadius: 2px`, `padding: 10px 18px`. `<IconBack> Go back`. Calls
    `navigate(-1)`.
  - **Browse library link**: `<Link to="/">` styled as primary CTA —
    `background: colorGreen`, `color: colorGreenInk`, no border, Mono uppercase
    11px weight 700. `<IconSearch> Browse library`.

## Behaviour

- **Go back**: `navigate(-1)` (navigates to previous page in history).
- **Browse library**: `<Link to="/">` (navigates to the Library home page at
  `/`).

## Notes

- **Outstanding work**: Outstanding work tracked in
  [`Outstanding-Work.md`](../../release/Outstanding-Work.md#not-found).
- **Copy/href mismatch**: The "Browse library" button points to `/` (the Library
  home, previously called "Profiles"). The copy and href are now consistent
  (both refer to the library).
- **Ghost numeral**: The `"404"` watermark is purely decorative and provides
  visual context that this is an error page.
