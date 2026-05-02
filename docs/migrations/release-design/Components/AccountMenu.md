# AccountMenu

> Status: **done** (Spec) · **not started** (Production) · last design change **2026-05-02** (PR #48 commit b633ae3)

## Files

- `design/Release/src/components/AccountMenu/AccountMenu.tsx`
- `design/Release/src/components/AccountMenu/AccountMenu.styles.ts`

## Purpose

Dropdown menu shown when the AppHeader avatar is clicked. Displays the user's identity card (initials badge, name, email) and two action buttons (Settings, Sign out). Purely presentational — the parent (AppHeader) owns open/close state and click-outside/ESC handlers.

## Visual

### Menu container

- **Position:** `absolute`, `top: calc(100% + 10px)`, `right: 0`, `zIndex: 20`.
- **Dimensions:** `width: 240px`.
- **Surface:** `backgroundColor: colorBg1`, `border: 1px solid colorBorder`, `borderRadius: radiusSm`, `boxShadow: 0 16px 40px rgba(0,0,0,0.55)`.
- **Layout:** `display: flex`, `flexDirection: column`, `overflow: hidden`.

### Identity row

- **Container:** `paddingTop/Bottom: 12px`, `paddingLeft/Right: 14px`, `display: flex`, `alignItems: center`, `columnGap: 12px`, `backgroundColor: colorSurface`, `borderBottom: 1px solid colorBorderSoft`.
- **Initials badge (`initials`):** 36×36 (was 40×40 in AppHeader, downsized here for proportion), `border-radius: 50%`, `backgroundImage: linear-gradient(140deg, colorGreenDeep, colorGreen)`, `color: colorGreenInk`, fontMono 13px weight 700, centred flex.
- **Identity text block (`identityText`):** `display: flex`, `flexDirection: column`, `minWidth: 0` (allows ellipsis).
  - **Name (`name`):** fontBody 13px, `colorText`, ellipsis on overflow (`text-overflow: ellipsis`, `white-space: nowrap`).
  - **Email (`email`):** fontMono 10px, `colorTextMuted`, `letterSpacing: 0.06em`, ellipsis on overflow.

### Menu items list

- **Container (`list`):** `paddingTop/Bottom: 4px`, `display: flex`, `flexDirection: column`.
- **Item (`item`):** `display: flex`, `alignItems: center`, `columnGap: 10px`, `width: 100%`, `paddingTop/Bottom: 10px`, `paddingLeft/Right: 14px`, fontMono 11px uppercase, `letterSpacing: 0.16em`, `color: colorText`, `backgroundColor: transparent`, no border, `cursor: pointer`. Hover: `backgroundColor: colorGreenSoft`, `color: colorGreen`. Transition: `background-color, color`.
  - **Arrow icon (`itemArrow`):** `marginLeft: auto`, fontMono, `color: colorTextFaint` (Settings item only; Sign out has no arrow).
- **Sign-out item (`itemDanger`):** At rest: `color: colorTextDim`. Hover: `backgroundColor: rgba(255,93,108,0.1)` (red tint), `color: colorRed`.

## Behaviour

- Rendered conditionally when menu is open (parent controls visibility via `opacity: 0 pointer-events: none` when closed).
- **Settings button:** Click calls `onSettings()` callback.
- **Sign out button:** Click calls `onSignOut()` callback.
- Root `<div>` has `role="menu"`; each item has `role="menuitem"` for accessibility.
- Parent (AppHeader) wires the callbacks to navigation: Settings → `/settings`, Sign out → `/goodbye`.

## Subcomponents

None. Single-file component; no nested sub-components.

## Porting checklist (`client/src/components/AccountMenu/`)

- [ ] **Props:** `{ initials, name, email, onSettings, onSignOut }` — all strings + two callback functions.
- [ ] **Menu container:** `position: absolute`, `top: calc(100% + 10px)`, `right: 0`, `zIndex: 20`, `width: 240px`, `backgroundColor: colorBg1`, border 1px `colorBorder`, `borderRadius: radiusSm`, `boxShadow: 0 16px 40px rgba(0,0,0,0.55)`
- [ ] **Identity row:** `paddingTop/Bottom: 12px`, `paddingLeft/Right: 14px`, flex row `alignItems: center`, `columnGap: 12px`, `backgroundColor: colorSurface`, `borderBottom: 1px solid colorBorderSoft`
- [ ] **Initials badge:** 36×36, circular gradient (`colorGreenDeep` → `colorGreen`), fontMono 13px 700, `colorGreenInk`, centred flex
- [ ] **Identity text:** flex column, name in fontBody 13px, email in fontMono 10px with `letterSpacing: 0.06em`, both with ellipsis on overflow
- [ ] **Items list:** flex column, `paddingTop/Bottom: 4px`
- [ ] **Menu item:** flex row `alignItems: center`, `columnGap: 10px`, `width: 100%`, `paddingTop/Bottom: 10px`, `paddingLeft/Right: 14px`, fontMono 11px uppercase `letterSpacing: 0.16em`, transparent bg, no border
- [ ] **Item hover:** `backgroundColor: colorGreenSoft`, `color: colorGreen` (transition `background-color, color`)
- [ ] **Settings item:** text + right-aligned arrow icon (`itemArrow`), `marginLeft: auto`
- [ ] **Sign out item:** apply `itemDanger` class — `color: colorTextDim` at rest, hover: `backgroundColor: rgba(255,93,108,0.1)`, `color: colorRed`
- [ ] **Accessibility:** root `role="menu"`, items `role="menuitem"`, `aria-hidden` on initials badge
- [ ] **Parent integration:** AppHeader owns open/close state, click-outside handler, ESC handler; passes `onSettings` → navigate `/settings`, `onSignOut` → navigate `/goodbye`
- [ ] **Fragment data:** Production should pass real user data from the Relay fragment (currently lab passes from `data/mock.ts`)

## Status

- [x] Designed in `design/Release` lab — extracted to own `.tsx` file (2026-05-02, PR #48 commit b633ae3). Prior to extraction, documented inline in AppHeader.md. Now a reusable component — AppHeader imports `<AccountMenu />` and renders conditionally.
- [ ] Production implementation
