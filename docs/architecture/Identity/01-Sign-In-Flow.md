# Identity — Sign-in Flow

Five user-facing flows. Each one ends with either a local session token being minted (for
sign-in / sign-up) or revoked (for sign-out). Supabase handles credential verification and
email flows; the Rust service issues the token that the app actually carries per-request.

## Boot — session restore

```
[ React main.tsx ]                [ auth.ts: restoreSession ]          [ localStorage ]
       │                                       │                               │
  initTelemetry()                              │                               │
  restoreSession()  ───────────────────────────▶                               │
                               readLocal(LocalStorageKey.Session) ─────────────▶
                               ◀── local-session-token (or null) ──────────────
                               validLocalClaims() — decode exp, no network
                               if unexpired: setUserContext(sub, email)
       ◀──── true / false ──────────────────────
  ReactDOM.render(...)
```

`restoreSession()` decodes the stored local token's `exp` **offline** (no network call). If
unexpired, it restores `userContext` immediately so the first Relay query already carries the
correct Bearer token. If expired or absent, the user is unauthenticated and the router sends
them to `/signin`.

The Supabase SDK auth-state subscription is still active for Supabase-initiated background
refreshes, but it **no longer mutates `userContext`** — identity is driven by the local
session, not Supabase events. See [`02-Session-And-Refresh.md`](02-Session-And-Refresh.md)
§"Carrying the local token".

## Sign in

```
[ SignInPage ]       [ auth.ts: signIn ]          [ Supabase API ]     [ POST /auth/session ]
     │                      │                            │                       │
  submit (email, pw) ────────▶                            │                       │
                   signInWithPassword(email, pw) ──────────▶                      │
                   ◀── { session.access_token } ──────────                        │
                   POST /auth/session (Bearer <supabase-jwt>) ───────────────────▶ │
                                                                jwks.verify_token  │
                                                                local_session::mint│
                                                                sessions INSERT    │
                   ◀── { token, userId, email, expiresAt } ───────────────────────
                   writeLocal(LocalStorageKey.Session, token)
                   setUserContext(userId, email)
     ◀── result ─────────────────────
  if !result.error: navigate("/", { replace: true })
```

On success the client carries the local session token (`xstream:session`) as the Bearer header
for all subsequent Relay requests and WS connections. Supabase's own session is kept alive in
the background for future sign-in and change-password calls, but is not used for request auth.

## Sign up

Same shape as sign in. `supabase.auth.signUp(email, password)` returns an access token when
auto-confirm is on (alpha default); the client immediately calls `exchangeForLocalSession` with
that token, minting a local session in the same way as sign-in.

If email confirmation is enabled, `session` is null on sign-up — the client navigates to
`/signin` and the local session is minted on the subsequent sign-in flow.

## Reset password (signed-out)

```
[ ResetPasswordPage ]   [ auth.ts: resetPassword ]   [ Supabase API ]
     │                           │                         │
  submit (email) ─────────────────▶                         │
                     resetPasswordForEmail(email) ───────────▶
                     ◀── { error: null } ───────────────────
     ◀── result ─────────────────────
  render "check your email" state
```

Supabase emails a magic link. No local session is issued — the user returns via sign-in after
resetting their password. No change from the previous model.

## Change password (signed-in)

`updateUser({ password })` does **not** challenge the current password. We re-authenticate
first before proceeding:

```
[ AccountTab ]     [ auth.ts: changePassword ]       [ Supabase API ]
     │                      │                               │
  submit (cur, new) ─────────▶                               │
                   getUser() ───────────────────────────────▶ │
                   ◀── { user.email } ────────────────────────
                   signInWithPassword(email, current) ─────────▶
                   ◀── reauth ok / error ───────────────────────
                   updateUser({ password: new }) ──────────────▶
                   ◀── { error: null } ─────────────────────────
     ◀── result ─────────────────────
  show success banner; clear form
```

Wrong current password → inline "Current password is incorrect" error, no rotation.

The existing local session token is **not** invalidated by a password change — the token is
signed with the per-install secret, not with a Supabase-derived credential. If the user wants
to force re-authentication on all devices, they must explicitly sign out.

## Sign out

```
[ AccountTab ]     [ auth.ts: signOut ]     [ POST /auth/logout ]   [ Supabase API ]
     │                     │                        │                      │
  click "Sign out" ─────────▶                        │                      │
                  POST /auth/logout (Bearer <local>)▶ │                      │
                                         revoke_session(jti) → 204          │
                  writeLocal(Session, null)│                                 │
                  getSupabase().auth.signOut() ──────────────────────────────▶
                  clearUserContext()       │                                 │
     ◀── done ──────────────────────
  clearSessionContext()
  commitLocalUpdate(env, store => store.invalidateStore())
  navigate("/signin", { replace: true })
```

Order matters: revoke the local session server-side first (sets `sessions.revoked_at`), then
clear the stored token, then sign out of Supabase, then clear telemetry / Relay state. This
ensures that in-flight requests carrying the now-revoked token will fail the
`is_session_active` check at the server.

A future request carrying the revoked `jti` will still pass HS256 signature and `exp`
verification — those checks are offline. Revocation is caught by the second check:
`db::is_session_active(jti)` returns false, and the request continues as anonymous.
