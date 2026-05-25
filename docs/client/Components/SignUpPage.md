# SignUpPage (page)

Account-creation form for the `/signup` route. Full-screen, **bypasses
AppShell**, hosted inside [`AuthLayout`](AuthLayout.md). Email, password,
and confirm-password fields with local mismatch validation.

**Source:** `client/src/pages/signup-page/`
**Used by:** Router as the `/signup` solo route, behind `requireSignedOut` loader.

## Role

Creates a new Supabase account via the JS SDK's `signUp`. With email confirmation OFF (alpha policy) the response carries a live session and the user lands on `/` immediately. If the project ever enables confirmation, `session` will be null and the user is bounced to `/signin` to wait for their inbox.

## Props

None — route shell, default-exported (lazy chunk `webpackChunkName: "SignUpPage"`).

## Layout & styles

Rendered into the [`AuthLayout`](AuthLayout.md) outlet. The page renders its own header at the top of its return value via the typography classes exported by `useAuthLayoutStyles()`:

- `eyebrow` class with text `"· FIRST TIME HERE"`.
- `title` class with text `"Create account"`.
- `subtitle` class with text `"One quest, one library, one ring of credentials."`.

The form uses the shared [`useAuthFormStyles()`](../../../client/src/components/auth-form/AuthForm.styles.ts) hook for visual rules, plus a small page-local `useSignUpStyles()` for the helper text.

### Field structure

1. **Email** — `type=email`, `autoComplete="email"`, `required`.
2. **Password** — `type=password`, `autoComplete="new-password"`, `required`, `minLength=8`.
3. **Confirm password** — `type=password`, `autoComplete="new-password"`, `required`. The input picks up `form.inputError` (red border) when `mismatch` is true; the error label `"Passwords don't match"` renders below the field.
4. **Inline error** (conditional) — Supabase error message rendered above the submit button when signup failed.
5. **Submit button** — green primary CTA labelled `"Create account"`. Disabled + label swaps to `"Creating account…"` while in-flight.
6. **Help row** — *"Already have an account? **Sign in**"* link to `/signin`.

## Behaviour

- Local `useState`: `email`, `password`, `confirm`, `showMismatch`, `error`, `submitting`.
- `showMismatch` gates the visual mismatch indicator so the user doesn't see "Passwords don't match" while still typing.
- `onSubmit` flow:
  1. `e.preventDefault()` + `setShowMismatch(true)`.
  2. If `password !== confirm`, return early — the visual hint already shows.
  3. Re-entrancy guard: ignore if `submitting`.
  4. `authService.signUp(email, password)`:
     - On error → render `error` inline, re-enable submit.
     - On success with `session` → `navigate("/", { replace: true })`.
     - On success without `session` (email-confirmation mode) → `navigate("/signin", { replace: true })`.

## Notes

- See [`../../architecture/Identity/01-Sign-In-Flow.md`](../../architecture/Identity/01-Sign-In-Flow.md) §Sign up.
- No Relay, no Nova events.
