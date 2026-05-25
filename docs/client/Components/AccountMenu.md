# AccountMenu

Dropdown menu shown when the AppHeader avatar is clicked. Displays the
user's identity card (initials badge, name, email) plus two action buttons
(Settings, Sign out). Purely presentational — the parent (AppHeader) owns
open/close state and click-outside / ESC handlers.

**Source:** `client/src/components/account-menu/`
**Used by:** `AppHeader` (right cluster, conditional render under the
avatar button).

## Role

Presentational dropdown for the post-avatar menu surface. Two actions:
**Settings** (navigates to `/settings`) and **Sign out** (runs the full
Supabase signout teardown via the parent). The component itself owns no
state — visibility is controlled by AppHeader and the callbacks fire
business logic in the parent.

## Sign-out wiring (parent)

`AppHeader` intercepts the `AccountMenuSignOutRequested` Nova event and runs:

1. `authService.signOut()` — invalidates the Supabase refresh token and
   clears the local SDK session. `userContext` clears as a side effect.
2. `clearSessionContext()` — drops any active playback OTel context.
3. `commitLocalUpdate(env, store => store.invalidateStore())` — marks
   every Relay record stale so the next signed-in session refetches.
4. `navigate("/signin", { replace: true })`.

The `AccountTab` (Settings → Account) duplicates this teardown for the
in-settings sign-out button — both surfaces must run the same sequence
in the same order.

## Props

| Prop | Type | Notes |
|---|---|---|
| `initials` | `string` | Up to 2 characters; rendered in the badge. |
| `name` | `string` | Full display name. Ellipsises on overflow. |
| `email` | `string` | Identity sub-line. Ellipsises on overflow. |
| `onSettings` | `() => void` | Settings click handler. |
| `onSignOut` | `() => void` | Sign-out click handler. |

## Layout & styles

### Container

- `position: absolute`, `top: calc(100% + 10px)`, `right: 0`, `zIndex: 20`.
- `width: 240px`.
- Surface: `backgroundColor: colorBg1`, `border: 1px solid colorBorder`,
  `borderRadius: radiusSm`, `boxShadow: 0 16px 40px rgba(0,0,0,0.55)`.
- `display: flex`, `flexDirection: column`, `overflow: hidden`.

### Identity row

- `paddingTop/Bottom: 12px`, `paddingLeft/Right: 14px`, flex row
  `alignItems: center`, `columnGap: 12px`.
- `backgroundColor: colorSurface`,
  `borderBottom: 1px solid colorBorderSoft`.
- **Initials badge** — 36×36 circle (downsized from AppHeader's 40×40 to
  fit the menu proportion), `border-radius: 50%`,
  `backgroundImage: linear-gradient(140deg, colorGreenDeep, colorGreen)`,
  `color: colorGreenInk`, fontMono 13px weight 700, centred flex.
- **Identity text** — flex column, `minWidth: 0` (allows ellipsis):
  - **Name** — fontBody 13px, `colorText`, ellipsis on overflow
    (`text-overflow: ellipsis`, `white-space: nowrap`).
  - **Email** — fontMono 10px, `colorTextMuted`,
    `letterSpacing: 0.06em`, ellipsis on overflow.

### Items list

- `paddingTop/Bottom: 4px`, flex column.
- Each item: `display: flex`, `alignItems: center`, `columnGap: 10px`,
  `width: 100%`, `paddingTop/Bottom: 10px`, `paddingLeft/Right: 14px`,
  fontMono 11px uppercase, `letterSpacing: 0.16em`, `color: colorText`,
  transparent bg, no border, `cursor: pointer`. Transition:
  `background-color, color`.
- Hover: `backgroundColor: colorGreenSoft`, `color: colorGreen`.
- **Settings item** — text + right-aligned arrow icon (`itemArrow`,
  `marginLeft: auto`, `color: colorTextFaint`).
- **Sign-out item** — applies `itemDanger` class. At rest:
  `color: colorTextDim`. Hover: `backgroundColor: rgba(255,93,108,0.1)`
  (red tint), `color: colorRed`.

## Behaviour

- Rendered conditionally when the menu is open. AppHeader controls
  visibility (typically with `opacity: 0; pointer-events: none` when
  closed, full visibility when open).
- Click handlers call `onSettings()` / `onSignOut()` — no internal
  navigation.
- Accessibility: root is `role="menu"`; each action is `role="menuitem"`;
  initials badge is `aria-hidden`.
- Click-outside and ESC handling live in the parent (AppHeader).

## Data

No fragments today — `initials`, `name`, `email` are passed as props from
AppHeader, which currently sources them from a hardcoded `USER` constant.
A viewer fragment (`me { initials name email }`) is the long-term source
and will replace the constant when the viewer query lands. See
[`Outstanding-Work.md`](../../release/Outstanding-Work.md#deferred-items-waiting-on-other-work).

## Notes

- Storybook coverage in `AccountMenu.stories.tsx` exercises both items
  and the hover/focus states.
- The component is intentionally dumb. If new menu actions appear, add
  them as items here and let AppHeader wire callbacks.
