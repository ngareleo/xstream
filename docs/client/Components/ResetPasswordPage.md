# ResetPasswordPage (page)

Password-reset request page for the `/reset-password` route. Full-screen,
**bypasses AppShell**, hosted inside [`AuthLayout`](AuthLayout.md). One
email field; on submit the page swaps to a static "Check your email"
confirmation state. **No backend wiring** — submit is a local
`preventDefault` plus a `setSent(true)`.

**Source:** `client/src/pages/reset-password-page/`
**Used by:** Router as the `/reset-password` solo route. Linked from the
"Forgot password?" line on `SignInPage`.

## Role

Two-state visual scaffold:

- **Form state** (`sent === false`): collect the email.
- **Confirmation state** (`sent === true`): show `"Check your email"`
  with the entered email interpolated into the body, plus a
  back-to-sign-in CTA and a `"Try a different email"` button that
  resets local state.

## Props

None — route shell, default-exported (lazy chunk
`webpackChunkName: "ResetPasswordPage"`).

## Layout & styles

Rendered into the [`AuthLayout`](AuthLayout.md) outlet. The page
renders its own header (eyebrow / title / subtitle) at the top of its
return value via the typography classes exported by
`useAuthLayoutStyles()`. The header text changes with state:

| State | eyebrow | title | subtitle |
|---|---|---|---|
| Form | `"· LOST THE KEY"` | `"Reset password"` | `"Tell us where to send the reset link. We'll do the rest."` |
| Confirmation | `"· LINK SENT"` | `"Check your email"` | `"We sent a reset link to {email} if an account exists. The link expires in 30 minutes."` |

Form uses the shared
[`useAuthFormStyles()`](../../client/src/components/auth-form/AuthForm.styles.ts)
hook plus a page-local `useResetPasswordStyles()` for:

- `backRow` — flex row, centred, `marginTop: 8px`. Hosts the
  "Back to sign in" text-link below the submit button.
- `sentActions` — flex column, `rowGap: 12px`, used in the confirmation
  state to stack the primary CTA over a transparent secondary button.
- `resendBtn` — borderless transparent button, Mono 11px uppercase
  `colorTextDim`, hover → `colorText`.

### Form-state structure

1. **Email** — `type=email`, `autoComplete="email"`, `required`.
2. **Submit button** — green primary CTA labelled `"Send reset link"`.
3. **Back to sign in** — `textLink` row centred under the button.

### Confirmation-state structure

1. **Back to sign in** — rendered as the green primary CTA via
   `<Link to="/signin" role="button" className={form.primaryBtn}>` so it
   matches the form's submit button visually.
2. **Try a different email** — secondary borderless button that resets
   `sent` and clears `email` (returns the user to the form state).

## Behaviour

- Local state: `email`, `sent`.
- Form submit: `e.preventDefault(); setSent(true);`.
- Confirmation "Try a different email": `setSent(false); setEmail("");`.
- The success subtitle uses `strings.formatString(...)` to interpolate
  `{email}`. The result is cast to `string` (the LocalizedStrings types
  return a union).

## Notes

- **No mail is ever sent** — the confirmation copy intentionally hedges
  with "if an account exists" so it remains accurate once the
  identity feature wires real reset-token mailing in behind it.
- No Relay, no Nova, no `useCallback`. Same constraints as the other
  two auth pages.
