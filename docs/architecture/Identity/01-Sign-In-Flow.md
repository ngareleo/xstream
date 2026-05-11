# Identity — Sign-in Flow

Five user-facing flows. Each one walks the same Supabase JS SDK → Supabase API → JWT → Rust server JWKS verify trail; what differs is which SDK method fires and which client routes engage.

## Boot — session restore

```
[ React main.tsx ]                       [ Supabase JS SDK ]                [ localStorage ]
       │                                          │                              │
  initTelemetry()                                 │                              │
  restoreSession()  ──────────────────────────────▶                              │
                                          getSession() ────────────────────────▶ │
                                          ◀── cached session (if any) ────────── │
       ◀──────────────── session / null ─────────────                            │
  if session: setUserContext(user.id)             │
  subscribe to auth changes                       │
  ReactDOM.render(...)                            │
```

`main.tsx` blocks on `restoreSession()` so the first Relay query already carries the JWT. The auth-state subscription stays live for the app's lifetime so token refreshes and remote sign-outs keep `userContext` in lockstep.

## Sign in

```
[ SignInPage ]              [ authService.signIn ]            [ Supabase API ]
     │                              │                                 │
  submit (email, pw) ───────────────▶                                 │
                          signInWithPassword(email, pw) ──────────────▶
                          ◀── { user, session, error } ───────────────
                          setUserContext(user.id)
                          (Supabase SDK writes session to localStorage)
     ◀── result ──────────────────────
  if !result.error: navigate("/", { replace: true })
```

Next Relay fetch reads the new JWT via `getAccessToken()` and attaches `Authorization: Bearer <jwt>` to the GraphQL POST. Server middleware verifies, stamps `user.id` on the request span, populates `RequestContext.user_id`.

## Sign up

Same shape as sign in, with `supabase.auth.signUp(email, password)`. The Supabase project has email confirmation **OFF** for alpha (auto-confirm), so the response carries a live session immediately. If the project flips on confirmation, `session` is null and `SignUpPage` navigates to `/signin` instead of `/`.

## Reset password (signed-out)

```
[ ResetPasswordPage ]      [ authService.resetPassword ]     [ Supabase API ]
     │                              │                              │
  submit (email) ───────────────────▶                              │
                       resetPasswordForEmail(email) ────────────────▶
                          ◀── { error: null } ──────────────────────
     ◀── result ──────────────────────
  render "check your email" state
```

Supabase emails a magic link. The deep-link handler that the user clicks lives on Supabase's hosted page in alpha — full in-app redirect handling is a follow-up.

## Change password (signed-in)

The Supabase SDK's `updateUser({ password })` does **not** challenge the current password — anyone with an active session could rotate it silently. We re-authenticate first by signing in with `(email, current)` and only proceed on success:

```
[ AccountTab ]            [ authService.changePassword ]        [ Supabase API ]
     │                              │                                  │
  submit (cur, new, cfm) ───────────▶                                  │
                          getUser() ────────────────────────────────────▶
                          ◀── { user.email } ────────────────────────────
                          signInWithPassword(email, current) ────────────▶
                          ◀── reauth ok / error ─────────────────────────
                          updateUser({ password: new }) ─────────────────▶
                          ◀── { error: null } ──────────────────────────
     ◀── result ──────────────────────
  show success banner; clear form
```

Wrong current password → inline "Current password is incorrect" error, no rotation.

## Sign out

```
[ AccountTab ]            [ authService.signOut ]         [ Supabase API + localStorage ]
     │                              │                                  │
  click "Sign out" ─────────────────▶                                  │
                          signOut() ──────────────────────────────────────▶ (invalidate refresh token)
                          (SDK clears session from localStorage)
                          clearUserContext()
     ◀── done ──────────────────────
  clearSessionContext()
  commitLocalUpdate(env, store => store.invalidateStore())
  navigate("/signin", { replace: true })
```

Order matters: stop Supabase first so any in-flight fetch can't carry a stale Bearer token, then clear telemetry/playback context, then invalidate Relay so the next signed-in session starts from a clean cache.
