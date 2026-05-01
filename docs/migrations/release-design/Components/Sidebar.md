# Sidebar

> Status: **baseline** (Spec) · **not started** (Production)

## Files

- `design/Release/src/components/Sidebar/Sidebar.tsx`
- `design/Release/src/components/Sidebar/Sidebar.styles.ts`
- Prerelease behavioural reference: `design/Prerelease/src/components/Sidebar/`

## Purpose

Left-rail navigation: top section is `NAVIGATION` (route links — Profiles, Library, Settings, Design system); below that `LIBRARIES` (live status of each scanned profile); footer is the user identity card.

## Visual

### Container (`side`)
- `gridArea: side`, 220px wide.
- `borderRight: 1px solid ${colorBorder}`.
- `backgroundColor: tokens.colorBg1` (`#0a0d0c`).
- `display: flex`, `flexDirection: column`.
- `paddingTop/Bottom: 18px`, `paddingLeft/Right: 12px`.

### Section labels (`sectionLabel`)
- JetBrains Mono 9px, `letter-spacing: 0.28em`, `color: tokens.colorTextFaint`.
- Padding `0 6px 10px`.
- `sectionLabelTopGap` adds `marginTop: 22px` between sections.

### Nav items (`navItem` + `navItemActive`)
- `<NavLink>` with `mergeClasses(s.navItem, isActive && s.navItemActive)`.
- Inactive: `color: tokens.colorTextDim`, transparent bg, 2px transparent left border.
- Active: `backgroundColor: tokens.colorGreenSoft`, `color: tokens.colorGreen`, `borderLeftColor: tokens.colorGreen`.
- Padding `9px 10px`, `font-size: 12px`, `letter-spacing: 0.04em`.
- Right corners only have radius (3px each) so the active left border draws cleanly.
- Transitions: `background-color, color, border-color` over `tokens.transition`.
- Inline icon (opacity 0.9) + label.

`NAV_ITEMS` array (in `Sidebar.tsx`):
```ts
[
  { to: "/", label: "Profiles", icon: <IconFolder />, end: true },
  { to: "/library", label: "Library", icon: <IconFilm /> },
  { to: "/settings", label: "Settings", icon: <IconCog /> },
  { to: "/design-system", label: "Design system", icon: <IconFilm /> },
]
```

### Library row (`libraryRow`)
- One row per profile in the mock `profiles` array.
- Layout: name + dot on the left, count on the right (`justify-content: space-between`).
- Padding `7px 10px`, `font-size: 12px`, `color: tokens.colorTextDim`.
- **Status dot** (`libraryDot`): 5px circle, `border-radius: 999px`. Variants:
  - `libraryDotOk`: `backgroundColor: tokens.colorGreen` (no scanning, no unmatched)
  - `libraryDotWarn`: `backgroundColor: tokens.colorYellow` (unmatched > 0 OR scanning)
- Count: JetBrains Mono 10px, `color: tokens.colorTextMuted`.

### User row (`userRow`)
- Pinned to bottom via `<div className={s.spacer} />` (flex: 1).
- Top border: `1px solid tokens.colorBorderSoft`, `marginTop: 12px`.
- Layout: avatar + name/meta column + chevron.
- **Avatar** (`avatar`): 30×30, `border-radius: 4px` on each corner, `background: linear-gradient(140deg, ${colorGreenDeep}, ${colorGreen})`, `color: tokens.colorGreenInk`, `font-weight: 700`, displays user initials.
- **userName**: 12px, `color: tokens.colorText`.
- **userMeta**: 10px JetBrains Mono, `color: tokens.colorTextMuted` — shows `user.hostMode`.
- Chevron: `color: tokens.colorTextMuted`, rotated `-90deg`.

## Behaviour

- `<NavLink end={true}>` for `/` so it doesn't stay active on `/library`.
- No animations beyond the `tokens.transition` colour transitions on nav items.
- No URL params, no internal state.

## Subcomponents

None.

## TODO(redesign)

- The user-row chevron currently has no click handler. Future: open a profile/account dropdown or sign-out menu (see [Goodbye.md](Goodbye.md)).
- Consider collapsing the sidebar to `tokens.sidebarCollapsedWidth` (52px) — the token exists but no toggle wires it.

## Porting checklist (`client/src/components/Sidebar/`)

- [ ] 220px width, `colorBg1` background, right border
- [ ] Section labels: JetBrains Mono 9px / 0.28em letter-spacing / faint colour
- [ ] Nav items: 2px left border, transparent at rest → green when active
- [ ] Active nav item: green-soft bg, green text, green left border
- [ ] Right corners only on nav item radius (clean active left edge)
- [ ] Library row: name + green-or-yellow status dot + count
- [ ] Status dot variants: green when matched + idle, yellow when unmatched OR scanning
- [ ] User row pinned via spacer flex: 1
- [ ] Avatar: 30×30, green-deep → green linear gradient, green-ink initials
- [ ] User meta in JetBrains Mono 10px showing host mode

## Status

- [ ] Designed in `design/Release` lab (baseline reflects current state)
- [ ] Production implementation
