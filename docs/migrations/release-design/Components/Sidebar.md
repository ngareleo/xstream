# Sidebar

> Status: **deleted / superseded** — the Sidebar component was removed in PR #46 commit 787f136 (`feat/release-design-omdb-griffel`, not yet merged to main). This file is a tombstone. Do not port this component.

## What happened

The `design/Release/src/components/Sidebar/` directory (both `Sidebar.tsx` and `Sidebar.styles.ts`) was deleted in PR #46 commit 787f136. No remaining references to `<Sidebar>` exist in the lab codebase.

Navigation (Library, Profiles, Watchlist links) moved to the centred nav in [`AppHeader`](AppHeader.md). The shell is now a single-column layout — see [`AppShell.md`](AppShell.md).

## What transferred to AppHeader

- **Avatar** — the user-row avatar (gradient + initials) is now rendered in the AppHeader right cluster at 34×34 (was 30×30 in the Sidebar user-row). Same gradient (`linear-gradient(140deg, colorGreenDeep, colorGreen)`), same ink colour, same initials pattern — only the container and size changed.

For the full avatar spec, see [`AppHeader.md`](AppHeader.md) — "Right cluster — Avatar" section.

## What was NOT ported

- **`LIBRARIES` section** (live status dots for each scanned profile) — this signal is absent from the new shell. When the production implementation reaches the AppHeader, a porting checklist note should track whether library scan status needs to surface in the header, a notification badge on the scan icon, or elsewhere.
- **NAVIGATION section** as a sidebar list — superseded by the three-link header nav.
- **User-row chevron / account dropdown** — was a TODO in the sidebar; still unresolved. Future: the avatar button in the header could open an account/sign-out dropdown.

## Prior spec (preserved for reference)

The sidebar spec recorded these values prior to deletion. They are not porting targets, but may be useful as reference if the `LIBRARIES` signal or user-row dropdown is re-introduced later in the header or a future overlay.

### Container

- `gridArea: side`, 220px wide.
- `borderRight: 1px solid ${colorBorder}`.
- `backgroundColor: tokens.colorBg1` (`#0a0d0c`).
- `display: flex`, `flexDirection: column`.
- `paddingTop/Bottom: 18px`, `paddingLeft/Right: 12px`.

### Section labels

- JetBrains Mono 9px, `letter-spacing: 0.28em`, `color: tokens.colorTextFaint`.

### Nav items

- Inactive: `color: tokens.colorTextDim`, transparent bg, 2px transparent left border.
- Active: `backgroundColor: tokens.colorGreenSoft`, `color: tokens.colorGreen`, `borderLeftColor: tokens.colorGreen`.
- Right corners only have radius (3px) so the active left border draws cleanly.

### Library row (LIBRARIES section)

- One row per profile. Layout: name + status dot on left, count on right.
- **Status dot variants:** `libraryDotOk` (green — matched + idle), `libraryDotWarn` (yellow — unmatched > 0 OR scanning).
- Count: JetBrains Mono 10px, `colorTextMuted`.

### User row

- Pinned to bottom via `<div className={s.spacer} />` (flex: 1).
- **Avatar:** 30×30, `border-radius: 4px`, `background: linear-gradient(140deg, ${colorGreenDeep}, ${colorGreen})`, `color: tokens.colorGreenInk`, `font-weight: 700`, displays `user.initials`.
- **userName:** 12px, `colorText`.
- **userMeta:** 10px JetBrains Mono, `colorTextMuted` — shows `user.hostMode`.
- Chevron: `colorTextMuted`, rotated `-90deg`.

## Changes from Prerelease

The Sidebar existed and was fully implemented in Prerelease. In Release it is deleted.

Key surface that existed in Prerelease and has no Release equivalent:
- `LIBRARIES` section: one row per profile with a live status dot (`libraryDotOk` green / `libraryDotWarn` yellow) and a film/episode count. This signal is absent from the Release shell entirely.
- Collapse toggle: `<button>` in the sidebar animated the AppShell grid column from 220px to 52px. The Release shell has no collapsible navigation surface.
- User-row chevron / account dropdown: in Prerelease, clicking the user-row opened a `<ProfileMenu>` (profile links + account settings + sign-out). In Release, the avatar button is in the AppHeader right cluster — a sign-out dropdown is not yet implemented (flagged as `TODO` in `AppHeader.md`).
- Nav structure: in Prerelease the sidebar held 4 links — Profiles (`/`), Library (`/library`), Settings, Feedback. All moved to the header except Feedback, which is removed.

For the full prior spec values (container dimensions, nav item styles, library-row anatomy, user-row avatar) see the "Prior spec (preserved for reference)" section above.

Cross-reference: [`Changes.md`](../Changes.md) — "Sidebar — deleted".

## Status

- [x] Designed in `design/Release` lab — **deleted** (2026-05-01, PR #46 commit 787f136, `feat/release-design-omdb-griffel`, not yet merged to main)
- [ ] Production implementation — N/A (do not port; component removed)
