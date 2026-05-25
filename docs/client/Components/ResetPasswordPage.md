# ResetPasswordPage (page)

Password-reset request page for the `/reset-password` route. Full-screen,
**bypasses AppShell**, hosted inside [`AuthLayout`](AuthLayout.md). One
email field; on submit the page asks Supabase to send a reset email and
swaps to a "Check your email" confirmation state.

**Source:** `client/src/pages/reset-password-page/`
**Used by:** Router as the `/reset-password` solo route, behind `requireSignedOut` loader. Linked from the "Forgot password?" line on `SignInPage`.

## Role

Two-state visual scaffold:

- **Form state** (`sent === false`): collect the email.
- **Confirmation state** (`sent === true`): show `"Check your email"` with the entered email interpolated into the body, plus a back-to-sign-in CTA and a `"Try a different email"` button that resets local state.

## Props

None — route shell, default-exported (lazy chunk `webpackChunkName: "ResetPasswordPage"`).

## Layout & styles

Rendered into the [`AuthLayout`](AuthLayout.md) outlet. Header text changes with state:

| State | eyebrow | title | subtitle |
|---|---|---|---|
| Form | `"· LOST THE KEY"` | `"Reset password"` | `"Tell us where to send the reset link. We'll do the rest."` |
| Confirmation | `"· LINK SENT"` | `"Check your email"` | `"We sent a reset link to {email} if an account exists. The link expires in 30 minutes."` |

Form uses the shared [`useAuthFormStyles()`](../../../client/src/components/auth-form/AuthForm.styles.ts) hook plus a page-local `useResetPasswordStyles()` for:

- `backRow` — flex row, centred, `marginTop: 8px`. Hosts the "Back to sign in" text-link below the submit button.
- `sentActions` — flex column, `rowGap: 12px`, used in the confirmation state to stack the primary CTA over a transparent secondary button.
- `resendBtn` — borderless transparent button, Mono 11px uppercase `colorTextDim`, hover → `colorText`.

### Form-state structure

1. **Email** — `type=email`, `autoComplete="email"`, `required`.
2. **Inline error** (conditional) — Supabase error rendered above the submit button.
3. **Submit button** — green primary CTA labelled `"Send reset link"`. Disabled + label swaps to `"Sending…"` while in-flight.
4. **Back to sign in** — `textLink` row centred under the button.

### Confirmation-state structure

1. **Back to sign in** — rendered as the green primary CTA via `<Link to="/signin" role="button" className={form.primaryBtn}>` so it matches the form's submit button visually.
2. **Try a different email** — secondary borderless button that resets `sent` and clears `email`.

## Behaviour

- Local state: `email`, `sent`, `error: string | null`, `submitting: bool`.
- Form submit: `authService.resetPassword(email)` — on success set `sent`; on error render inline.
- Confirmation "Try a different email": `setSent(false); setEmail("");`.
- Success subtitle uses `strings.formatString(...)` to interpolate `{email}`. Result is cast to `string` (the LocalizedStrings types return a union).
- The success copy intentionally hedges with "if an account exists" — Supabase doesn't reveal whether the email matched a real account, and our UI follows that posture.

## Notes

- The actual link in the email points at Supabase's hosted reset page in alpha; in-app deep-link handling for the reset confirmation lands later.
- No Relay, no Nova events.
