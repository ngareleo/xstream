# SignInPage (page)

Sign-in form for the `/signin` route. Full-screen, **bypasses AppShell**,
hosted inside [`AuthLayout`](AuthLayout.md). Email + password fields, a
"Forgot password?" link, and a "New here? Create an account" link.
**No backend wiring** — `onSubmit` is a `preventDefault` no-op.

**Source:** `client/src/pages/signin-page/`
**Used by:** Router as the `/signin` solo route.

## Role

Visual scaffold for the sign-in flow. Holds local state for the two
inputs and intercepts submit so the page doesn't do a full reload. The
two text-link helpers route to the sibling auth pages.

## Props

None — route shell, default-exported (lazy chunk
`webpackChunkName: "SignInPage"`).

## Layout & styles

Rendered into the [`AuthLayout`](AuthLayout.md) outlet. The page
renders its own header elements at the top of its return value, using
the typography classes exported by `useAuthLayoutStyles()`:

- `eyebrow` class with text `"· WELCOME BACK"`.
- `title` class with text `"Sign in"`.
- `subtitle` class with text
  `"Pick up exactly where you left off — your library is waiting."`.

Below the header, the form uses the shared
[`useAuthFormStyles()`](../../client/src/components/auth-form/AuthForm.styles.ts)
hook for `form`, `field`, `label`, `input`, `primaryBtn`, `helpRow`,
`textLink`, and `inlineLink`.

### Page-specific overrides (`SignInPage.styles.ts`)

- `forgotRow`: flex row aligned to the right, `marginTop: -4px` so the
  link tucks under the password field.
- `helperText`: Body 12px `colorTextDim` for the bottom helper line.

### Field structure

1. **Email** input — `type=email`, `autoComplete="email"`, `required`.
2. **Password** input — `type=password`, `autoComplete="current-password"`,
   `required`.
3. **Forgot password?** — `<Link to="/reset-password">`.
4. **Submit button** — green primary CTA.
5. **Help row** (separator-line above) — *"New here? **Create an account**"*
   with the link going to `/signup`.

## Behaviour

- Email + password held in local `useState`.
- `onSubmit={(e) => e.preventDefault()}` — no fetch, no mutation, no
  navigation. Form values stay on screen so the visual scaffold is
  inspectable.
- Tab order matches the visual order: email → password → forgot link →
  submit → create-account link.

## Notes

- **No Relay** (no data fetched).
- **No Nova events** (no cross-cutting interceptors needed yet).
- **No `useCallback`** — Nova guarantees aren't in play here, and there
  are no perf-sensitive children.
- Backend wiring (mutation, redirect, error states) lands when the
  identity feature is added.
