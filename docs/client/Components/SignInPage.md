# SignInPage (page)

Sign-in form for the `/signin` route. Full-screen, **bypasses AppShell**,
hosted inside [`AuthLayout`](AuthLayout.md). Email + password fields, a
"Forgot password?" link, and a "New here? Create an account" link.

**Source:** `client/src/pages/signin-page/`
**Used by:** Router as the `/signin` solo route, behind `requireSignedOut` loader (signed-in users are bounced to `/`).

## Role

Authenticates a returning user via Supabase password auth. On success, sets `userContext` (telemetry stamps `user.id` from this point forward) and navigates to `/` (replace). On failure, renders the error message inline below the form.

## Props

None — route shell, default-exported (lazy chunk `webpackChunkName: "SignInPage"`).

## Layout & styles

Rendered into the [`AuthLayout`](AuthLayout.md) outlet. The page renders its own header elements at the top of its return value, using the typography classes exported by `useAuthLayoutStyles()`:

- `eyebrow` class with text `"· WELCOME BACK"`.
- `title` class with text `"Sign in"`.
- `subtitle` class with text `"Pick up exactly where you left off — your library is waiting."`.

Below the header, the form uses the shared [`useAuthFormStyles()`](../../../client/src/components/auth-form/AuthForm.styles.ts) hook for `form`, `field`, `label`, `input`, `primaryBtn`, `helpRow`, `textLink`, `inlineLink`, and `fieldError`.

### Page-specific overrides (`SignInPage.styles.ts`)

- `forgotRow`: flex row aligned to the right, `marginTop: -4px` so the link tucks under the password field.
- `helperText`: Body 12px `colorTextDim` for the bottom helper line.

### Field structure

1. **Email** input — `type=email`, `autoComplete="email"`, `required`.
2. **Password** input — `type=password`, `autoComplete="current-password"`, `required`.
3. **Forgot password?** — `<Link to="/reset-password">`.
4. **Inline error** (conditional) — rendered above the submit button when the previous attempt failed.
5. **Submit button** — green primary CTA. Disabled + text swaps to `strings.submitting` while in-flight.
6. **Help row** (separator-line above) — *"New here? **Create an account**"* with the link going to `/signup`.

## Behaviour

- Email + password + `error: string | null` + `submitting: bool` held in local `useState`.
- `onSubmit` calls `authService.signIn(email, password)`:
  - On error → set `error`, stay on page.
  - On success → `navigate("/", { replace: true })`. The Relay environment reads the JWT per-request, so the first post-signin query already carries the new Authorization header.
- Re-entrancy guard: ignores submit while `submitting` is true.

## Notes

- **No Relay** (auth is not behind GraphQL).
- **No Nova events** (no cross-cutting interceptors needed).
- See [`../../architecture/Identity/01-Sign-In-Flow.md`](../../architecture/Identity/01-Sign-In-Flow.md) for the end-to-end sequence.
