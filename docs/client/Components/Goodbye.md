# Goodbye (page)

Sign-out farewell page, full-screen (`/goodbye`). **Bypasses AppShell** — owns
its own viewport (100vw × 100vh). Auto-redirects to `/` after 4 seconds.
Displays a branded farewell message with countdown timer and manual redirect button.

**Source:** `client/src/pages/goodbye-page/`
**Used by:** Router as `/goodbye` route (typically navigated to after sign-out).

## Role

Sign-out completion screen. Renders farewell messaging with the user's name,
counts down from 4 seconds, and auto-navigates back to home. Provides a manual
"Back to home" button for users who don't want to wait. Uses `replace: true`
on all navigations so the back button doesn't loop through `/goodbye`.

## Props

None — the page is a route shell. Uses `navigate()` with `replace: true` for
redirect control.

## Layout & styles

### Outer container

- `width: 100vw`, `height: 100vh`, `background: colorBg0`, `position: relative`,
  `overflow: hidden`, `color: colorText`.

### Layered atmosphere (bottom to top)

1. `.grain-layer` utility, `opacity: 0.22`.
2. Radial green glow: `radial-gradient(ellipse at center, colorGreenSoft 0%,
   transparent 55%)`, `pointerEvents: none`.
3. **Ghost watermark**: Font-size 30vw, Anton, `opacity: 0.03`,
   `letter-spacing: -0.04em`, content `"GOODBYE"`. `aria-hidden`, no select/pointer.
4. Centred content stack (`zIndex: 2`).

### Centred content

- Flex column, centred (both axes), `gap: 18px`, `padding: 24px`.
- **Brand mark**: `<Logo02 size={64} showWordmark={false} />` at `opacity: 0.6`.
- **Eyebrow**: Mono 11px uppercase `colorGreen` — `"· SESSION ENDED"`.
- **Display message**: Anton 64px, `lineHeight: 0.95`, `letterSpacing: -0.01em`,
  uppercase — `"See you next time, {user.name}."`.
- **Body line**: `colorTextDim`, max-width 460 — `"Your library will be right
  here when you get back."`.
- **Action row** (`margin-top: 12px`):
  - **Back-to-home button**: `background: colorGreen`, `color: colorGreenInk`,
    no border, `padding: 10px 22px`, Mono 11px / `letterSpacing: 0.18em` /
    uppercase / weight 700, `borderRadius: 2px`. Calls `navigate("/",
    { replace: true })`.
  - **Countdown text**: Mono 11px / `colorTextMuted` / `letterSpacing: 0.1em` —
    `"Redirecting in {countdown}s…"`.

## Behaviour

### Auto-redirect timer

- `REDIRECT_DELAY = 4` seconds.
- `useState(REDIRECT_DELAY)` with `useEffect` on `countdown` change:
  - If `countdown <= 0`: `navigate("/", { replace: true })`, return.
  - Otherwise: schedule `setTimeout(() => setCountdown(c => c - 1), 1000)`,
    return cleanup.
- Effect dep array: `[countdown, navigate]`.
- **Known quirk**: React StrictMode double-invokes the initial `useEffect`, so
  the visible countdown can decrement twice on mount (1 second feels skipped).
  Minor; left as-is in production.

### Manual redirect

- Back button calls `navigate("/", { replace: true })` immediately.
- `replace: true` on both manual and auto navigation ensures back-button doesn't
  return to `/goodbye`.

## Notes

- **Outstanding work**: Outstanding work tracked in
  [`Outstanding-Work.md`](../../release/Outstanding-Work.md#goodbye).
- **Sign-out wiring**: Currently `/goodbye` is reached only by direct visit or
  explicit navigation (e.g., from AccountMenu sign-out handler). Ensure the
  sign-out flow navigates here after clearing session state.
- **StrictMode double-invoke**: The countdown quirk is benign and could be fixed
  by keying off `Date.now()` instead of incremental state, but is left as-is
  unless StrictMode double-invocation becomes a problem in production.
