# Settings (page)

> Status: **done** (Spec) · **done** (Production)

## Files

- `design/Release/src/pages/Settings/Settings.tsx`
- `design/Release/src/pages/Settings/Settings.styles.ts`
- Prerelease behavioural reference: `design/Prerelease/src/pages/Settings/`

## Purpose

App settings (`/settings`). Two-pane layout: left nav (220px) + right content. Six sections: General · Library · Playback · Metadata · Account · Danger zone.

## Visual

### Outer container (`.shell`)
- `height: 100%`, `display: grid`, `gridTemplateColumns: "220px 1fr"`, `overflow: hidden`.
- **`paddingTop: tokens.headerHeight`, `boxSizing: border-box`** — the page is responsible for its own header clearance.

### Left nav
- `border-right: 1px solid var(--border)`, `background: var(--bg-1)`, `padding: 20px`, `display: flex; flex-direction: column; gap: 4px`.
- Eyebrow `SETTINGS` at top with `margin-bottom: 14px`.
- Nav button per section: `padding: 9px 12px`, no border on the chrome, `font-size: 12px`, left-aligned.
  - Active: `background: var(--green-soft)`, `color: var(--green)`, `border-left: 2px solid var(--green)`, `border-radius: 2px`.
  - Inactive: transparent bg, `color: var(--text-dim)`, transparent left border (so layout doesn't shift).

### Right content
- `overflow: auto`, `padding: 32px 40px`.
- Eyebrow `· {ACTIVE.TOUPPERCASE()}` in green.
- Title: Anton 40px, `letter-spacing: -0.01em`, uppercase, `color: var(--text)`, with `margin-top: 12, margin-bottom: 24`.
- Body: `max-width: 640px`, contains the section's `<SettingsRow>` definitions.

## Behaviour

### Section selection
- `SectionId = "general" | "library" | "playback" | "metadata" | "account" | "danger"`.
- `VALID_SECTIONS` Set guards against malformed URLs.
- URL deep-link: `?section=<id>`. Reads via `useSearchParams`.
- `setActive(id)` writes `next.set("section", id)` and pushes via `setParams(next)`.
- Default: `general` when no/invalid section param.

## Subcomponents

Three primitives extracted into production at `client/src/components/`:

### `SettingsRow` (`client/src/components/settings-row/`)
- `label: string`, optional `hint: string`, `control: ReactNode`.
- Grid `1fr auto`, `column-gap: 16px`, vertical padding `14px`, separator `1px solid colorBorderSoft` on the bottom.
- Label: `13px / colorText`. Hint: `11px / colorTextMuted`, `marginTop: 4`, `lineHeight: 1.5`.
- Lab still uses inline `SettingsRow`; production primitive is the canonical source going forward.

### `SettingsToggle` (`client/src/components/settings-toggle/`)
- `on: boolean`, `onChange: (next: boolean) => void`, optional `ariaLabel`, `disabled`.
- 38×20 with `borderRadius: radiusFull`. Off track: `colorSurface2` bg + `colorBorder`. On track: `colorGreen` bg + `colorGreen` border.
- Knob 14×14, slides `left: 2 → 20`. Off knob: `colorTextDim`. On knob: `colorGreenInk`. Transitions on `left, background-color` at `tokens.transition`.
- Renders as `<button role="switch">` with `aria-checked`. Used by `FlagsTab` for boolean flags.

### `SettingsSelector` (`client/src/components/settings-selector/`)
- `value: string`, optional `onClick`, `ariaLabel`, `disabled`.
- Surface-2 button: padding `6 12`, `colorBorder` 1px, `radiusSm`, `fontMono 11px / 0.08em`. Renders `value ▾` with chevron in `colorTextMuted`.
- Hover (when not disabled) lights the border green. No live consumer in M8 production tabs (their controls are inputs/buttons, not enum selectors); primitive ready for adoption when a tab needs an enum selector.

## Changes from Prerelease

- **Header clearance:** OLD — AppShell grid reserved a 52px header row; Settings did not need any `paddingTop`. NEW — `.shell` adds `paddingTop: tokens.headerHeight, boxSizing: border-box` because the shell no longer reserves a grid row.
- **AppHeader rendering:** OLD — Settings rendered `<AppHeader collapsed={false}>` as its own child (required by the Prerelease grid model). NEW — AppHeader is provided by the Release `<AppShell>`; Settings does not render its own header.
- **Identity:** Active nav button: OLD — `background: var(--red-dim)`, `border-left: 2px solid var(--red)`, `color: var(--white)`. NEW — `background: var(--green-soft)`, `border-left: 2px solid var(--green)`, `color: var(--green)`. Otherwise the left nav structure (220px, `bg-1`, eyebrow `SETTINGS`, gap 4px, 9px 12px buttons) is unchanged.
- **No structural change** — 220px left nav + 1fr right content, six sections, `?section=<id>` URL state, `max-width: 640px` body — all unchanged from Prerelease.

## Production deviations from lab

Production keeps its existing **5 functional tabs** (`library`, `metadata`, `flags`, `trace`, `danger`) inside the new 220px-nav shell instead of the lab's 6 decorative sections (`general`, `library`, `playback`, `metadata`, `account`, `danger`). Rationale: production controls real settings (OMDb key save, library scan, flag toggles, trace history table); the lab's `general/playback/account` mockups have no backing services. Adding stub sections would add dead UI.

URL deep-link: `?section=<id>` per spec — hard-switch from the prior `?tab=<id>` (no back-compat redirect; xstream is desktop-bundled, not SEO-indexed).

Relay-query placement: `TraceHistoryTab` runs its own `useLazyLoadQuery<TraceHistoryTabQuery>` and is wrapped in a `<Suspense>` boundary at the page level, so Library/Metadata/Flags/Danger sections don't pay for the playback-history fetch. This is the first instance of the section-tab exception now documented in [`docs/code-style/Client-Conventions/00-Patterns.md`](../../../code-style/Client-Conventions/00-Patterns.md).

## Porting checklist (`client/src/pages/settings-page/`)

- [x] 220px nav + 1fr content, full-height grid; `paddingTop: tokens.headerHeight`, `boxSizing: border-box` (page manages header clearance) — `SettingsPage.styles.ts:6–14`
- [x] Nav: bg-1 background, right border, eyebrow `SETTINGS` at top — `SettingsPage.styles.ts:15–25`, `SettingsPageContent.tsx:43`
- [x] Nav buttons: green-soft + green text + 2px green left border when active — `SettingsPage.styles.ts:55–62` (active overlay on the 2px transparent left border declared at `:34`)
- [x] Content: Anton 40px uppercase title, eyebrow above — `SettingsPage.styles.ts:70–79`
- [x] Body max-width 640px — `SettingsPage.styles.ts:80`
- [x] URL deep-link: `?section=<id>`, validated against the SectionId set — `SettingsPageContent.tsx:14–27, 33`
- [x] Default to "general" when section param missing/invalid — **production deviation:** defaults to `library` (no `general` section in production); see Production deviations
- [x] Six sections: General, Library, Playback, Metadata, Account, Danger zone — **production deviation:** 5 functional sections (`library`, `metadata`, `flags`, `trace`, `danger`); see Production deviations
- [x] Wire each setting through to `user_settings` (or matching) backend table — `setSetting` GraphQL mutation persists to the `user_settings` SQLite table (`server-rust/src/db/migrate.rs:94`, `server-rust/src/db/queries/user_settings.rs`); MetadataTab writes the OMDb API key via this path; FlagsTab persists per-user via `useFeatureFlag` context (same backing table)
- [x] Toggle switch: 38×20, green when active — `SettingsToggle.styles.ts:6–9` (38×20) + `:30–36` (green track on)
- [x] Danger zone: separate visual treatment (red?) — kept red border + red text via shared `dangerZone` / `btnDanger` styles in `SettingsTabs.styles.ts:80–113`

## Status

- [x] Designed in `design/Release` lab — baseline reflects prior state; `.shell` gains `paddingTop: tokens.headerHeight, boxSizing: border-box` for positioned-shell header clearance (2026-05-01, PR #46 commit 5301df6, `feat/release-design-omdb-griffel`, not yet merged to main)
- [x] Production implementation — M8 ported the page shell to the new 220px-nav layout, extracted `SettingsRow` / `SettingsToggle` / `SettingsSelector` primitives, retoken'd all 5 tabs to green identity, and pushed the Relay query down into `TraceHistoryTab` (2026-05-03, M8 commit on `release-design` branch)
