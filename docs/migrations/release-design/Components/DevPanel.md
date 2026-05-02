# DevPanel

> Status: **baseline** (Spec) · **not started** (Production — n/a, lab only)
> Spec created: 2026-05-02 — Floating jump-to-state panel mounted in AppShell. Design lab only — QA tool for navigating every named route/state without typing URLs. Not part of the production port; will be deleted before Xstream ships.

## Files

- `design/Release/src/components/DevPanel/DevPanel.tsx`
- `design/Release/src/components/DevPanel/DevPanel.styles.ts`

## Purpose

Design-lab-only floating panel that allows QA and designers to jump directly to any page/state in the prototype without manually navigating or typing URLs. Persists open/closed state in localStorage. Mounted at the end of `<AppShell>` so it renders on every page (except full-screen pages like `/player/:id` and `/goodbye`, where it is intentionally hidden).

## Visual

### Container
- `position: fixed`, `bottom: 24px`, `right: 24px`, `zIndex: 100` (floats above all page content).
- `backgroundColor: tokens.colorBg1`, `border: 1px solid tokens.colorBorder`, `borderRadius: tokens.radiusSm`.
- `minWidth: 220px`, `maxWidth: 280px`.
- Box shadow for depth: `0 8px 24px rgba(0, 0, 0, 0.42)`.
- Collapse/expand button in top-right corner (chevron icon, 16×16).

### Header (when expanded)
- `paddingTop: 12px`, `paddingBottom: 8px`, `paddingLeft: 12px`, `paddingRight: 12px`.
- Title: "Dev Panel" in Mono 10px green uppercase.
- `borderBottomWidth: 1px`, `borderBottomStyle: solid`, `borderBottomColor: tokens.colorBorderSoft`.

### Content (when expanded)
- Flex column, `rowGap: 8px`, `paddingTop: 8px`, `paddingBottom: 12px`, `paddingLeft: 12px`, `paddingRight: 12px`.
- Each group (Profiles, Library, Player, System, Edge cases):
  - **Group label:** Mono 9px uppercase, `color: tokens.colorTextFaint`, `letterSpacing: 0.18em`.
  - **Entries:** list of clickable links, one per row.
    - Mono 11px, `color: tokens.colorText` at rest.
    - On hover: `color: tokens.colorGreen`, `backgroundColor: rgba(232, 238, 232, 0.04)`, `paddingLeft: 6px`, `paddingRight: 6px`, `paddingTop: 4px`, `paddingBottom: 4px`.
    - Active entry (current route): `color: tokens.colorGreen`, `backgroundColor: rgba(232, 238, 232, 0.08)` (tinted green).

### Collapsed state
- Shows only the title bar and the chevron button. Content is hidden.
- Click the chevron to toggle expand.

## Behaviour

### Persistence
- Uses `localStorage.getItem("xstream.designLab.devPanelOpen")` to read initial state (true/false).
- On toggle, saves the new state to localStorage.
- Default (first load): expanded (`true`).

### Navigation
- Each entry is a `<Link>` or `<button>` that navigates to the target route.
- Active route is detected via React Router's `useLocation()` hook.
- Current route's entry is highlighted in green.

### Conditional hiding
- Hidden on `/player/:id` and `/goodbye` routes (full-screen pages).
- Visible on all other routes.

## Subcomponents

None.

## Groups + entries

| Group | Entries | Routes |
|---|---|---|
| **Profiles** | List, Empty, New profile, Edit profile | `/profiles`, `/profiles?empty=1`, `/profiles/new`, `/profiles/:profileId/edit` |
| **Library** | Home, Watchlist | `/`, `/watchlist` |
| **Player** | Oppenheimer (example film) | `/player/oppenheimer-film-id` |
| **System** | Settings, Design system | `/settings`, `/design-system` |
| **Edge cases** | Error, 404, Goodbye | `/error`, `/404`, `/goodbye` |

## Changes from Prerelease

This component is new in Release — no Prerelease equivalent.

## TODO(redesign)

- None. This is a design-lab utility that will be deleted before production.

## Porting checklist

**N/A — Design lab only.** This component will not be ported to production. It exists solely to provide QA with a quick navigation tool during the design phase. Before Xstream ships, this file and all references to it should be removed.

## Status

- [x] Designed in `design/Release` lab — DevPanel floating jump-to-state panel 2026-05-02, PR #48. Mounted in AppShell at bottom-right, persists open/closed state in localStorage key `xstream.designLab.devPanelOpen`. Hides on full-screen routes (`/player/:id`, `/goodbye`). Lists every named route + state with active state highlighted in green.
- [ ] **N/A — Lab only** (will be deleted before production ship)

## Notes

- **Not a production component.** This is a design-lab utility that simplifies QA navigation. Remove it before porting to `client/src/`.
- **localStorage key:** `xstream.designLab.devPanelOpen` (boolean).
- **Example film ID:** "oppenheimer-film-id" is a placeholder; update to a real film from the mock data or leave as a dead link (QA will know it won't play).
