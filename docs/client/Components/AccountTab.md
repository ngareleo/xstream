# AccountTab

Settings → Account tab. Shows the signed-in user's email, hosts the
change-password form, and provides an in-settings sign-out button.

**Source:** `client/src/components/account-tab/`
**Used by:** [`SettingsPageContent`](SettingsPage.md) — rendered when the active section is `"account"` (the default tab post-signin).

## Role

Three sections, top to bottom:

1. **Email** — read-only display of the current user's address.
2. **Change password** — reauth-then-update form (Supabase has no native current-password check, so we sign in with `(email, current)` first and only update on success).
3. **Sign out** — secondary action that runs the same teardown as the AppHeader's AccountMenu sign-out.

## Props

None — pulls session state from `authService.getSession()` and writes via `authService.changePassword` / `signOut`.

## Layout & styles

Reuses [`useSettingsTabStyles()`](../../../client/src/components/settings-tabs/SettingsTabs.styles.ts) for the shared section headings, labels, inputs, and primary button. Local `useAccountTabStyles()` adds:

- `email` — Mono 13px display row for the address.
- `fieldStack` — vertical stack of the three password fields, `rowGap: 12px`.
- `errorMsg` — Red 11px error line shown above the submit button on failure.
- `signOutZone` — separator-line group: `marginTop: 24px`, `paddingTop: 16px`, `borderTop: 1px solid colorBorderSoft`. Wraps the change-password form AND the sign-out section so each gets visual breathing room from the previous.
- `signOutBtn` — outlined neutral button (transparent bg, 1px border `colorBorder`, `colorTextMuted`), hover → `colorText` + `colorTextFaint` border.

### Change-password fields

1. **Current password** — `type=password`, `autoComplete="current-password"`, required.
2. **New password** — `type=password`, `autoComplete="new-password"`, required, `minLength=8`.
3. **Confirm new password** — `type=password`, `autoComplete="new-password"`, required.
4. **Inline error** (conditional) — red message above submit.
5. **Success banner** (conditional) — green "Password updated." line.
6. **Submit** — primary CTA, label swaps to "Updating…" while in-flight.

## Behaviour

- Loads email via `useEffect` + `getSession()` on mount (idempotent — Supabase reads from localStorage, no extra fetch).
- Local state: `current`, `next`, `confirmNext`, `error`, `success`, `submitting`.
- Client-side validation before hitting Supabase: new-password length ≥ 8, new === confirmNext. Both render inline errors and short-circuit.
- `changePassword(current, next)` performs the reauth-then-update sequence in `authService.ts`. Wrong current password surfaces as `"Current password is incorrect."`; any Supabase update error bubbles through `err.message`.
- On success: clear all three fields, show success banner.

### Sign-out

`onSignOut` runs the canonical teardown:

```ts
await signOut();              // 1. clear Supabase session + userContext
clearSessionContext();        // 2. drop any playback OTel context
commitLocalUpdate(env, s => s.invalidateStore());  // 3. wipe Relay
navigate("/signin", { replace: true });
```

Mirrors AppHeader's AccountMenu sign-out — both surfaces must run the same sequence in the same order. See [`AccountMenu.md`](AccountMenu.md) §"Sign-out wiring (parent)".

## Data

No Relay fragments. Identity is read via `authService.getSession()` (Supabase SDK), not via `currentUser` from the GraphQL surface — the SDK already has the session cached locally and round-tripping via GraphQL would be slower without adding any guarantee.

## Notes

- No Nova events today. The sign-out action is local-only (no cross-cutting interceptors); if telemetry around sign-out frequency becomes interesting, emit a Nova event here later.
- See [`../../architecture/Identity/01-Sign-In-Flow.md`](../../architecture/Identity/01-Sign-In-Flow.md) §"Change password" and §"Sign out" for the end-to-end sequences.
