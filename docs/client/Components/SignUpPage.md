# SignUpPage (page)

Account-creation form for the `/signup` route. Full-screen, **bypasses
AppShell**, hosted inside [`AuthLayout`](AuthLayout.md). Email, password,
and confirm-password fields with local mismatch validation. **No backend
wiring** — `onSubmit` only flips the validation gate.

**Source:** `client/src/pages/signup-page/`
**Used by:** Router as the `/signup` solo route.

## Role

Visual scaffold for new-account creation. The only behaviour beyond
local-state inputs is the confirm-password mismatch indicator, which
is suppressed until the user submits once.

## Props

None — route shell, default-exported (lazy chunk
`webpackChunkName: "SignUpPage"`).

## Layout & styles

Rendered into the [`AuthLayout`](AuthLayout.md) outlet. The page
renders its own header at the top of its return value via the
typography classes exported by `useAuthLayoutStyles()`:

- `eyebrow` class with text `"· FIRST TIME HERE"`.
- `title` class with text `"Create account"`.
- `subtitle` class with text
  `"One quest, one library, one ring of credentials."`.

The form uses the shared
[`useAuthFormStyles()`](../../client/src/components/auth-form/AuthForm.styles.ts)
hook for visual rules, plus a small page-local `useSignUpStyles()` for
the helper text.

### Field structure

1. **Email** — `type=email`, `autoComplete="email"`, `required`.
2. **Password** — `type=password`, `autoComplete="new-password"`,
   `required`, `minLength=8`.
3. **Confirm password** — `type=password`, `autoComplete="new-password"`,
   `required`. The input picks up `form.inputError` (red border) when
   `mismatch` is true; when shown, the error label
   `"Passwords don't match"` renders below the field.
4. **Submit button** — green primary CTA labelled `"Create account"`.
5. **Help row** — *"Already have an account? **Sign in**"* link to `/signin`.

## Behaviour

- Three values in local `useState`: `email`, `password`, `confirm`.
- A `showMismatch` boolean (also `useState`) gates the visual error so
  the user doesn't see "Passwords don't match" while still typing.
- `onSubmit` flow:
  1. `e.preventDefault()`.
  2. `setShowMismatch(true)`.
- `mismatch` derives as `showMismatch && confirm.length > 0 && password !== confirm`.
- `aria-invalid` is mirrored on the confirm input when `mismatch` is true.
- No fetch, no navigation, no Nova event.

## Notes

- The mismatch validation is purely visual — the form *would* still
  "submit" (preventDefault path) regardless of mismatch. Backend
  wiring will add real submission gating.
- No Relay, no Nova, no `useCallback`. Same constraints as `SignInPage`.
