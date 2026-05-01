# Settings (page)

> Status: **baseline** (Spec) · **not started** (Production)

## Files

- `design/Release/src/pages/Settings/Settings.tsx` (no `.styles.ts` — inline)
- Prerelease behavioural reference: `design/Prerelease/src/pages/Settings/`

## Purpose

App settings (`/settings`). Two-pane layout: left nav (220px) + right content. Six sections: General · Library · Playback · Metadata · Account · Danger zone.

## Visual

### Outer container
- `height: 100%`, `display: grid`, `gridTemplateColumns: "220px 1fr"`, `overflow: hidden`.

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

(All inline in `Settings.tsx`. Source values not yet extracted into named exports.)

### `SettingsRow`
- TODO(redesign): label + hint + control layout. Confirm spacing + typography from current source.

### `Toggle`
- TODO(redesign): 38×20 switch, green when active (per browse-agent inventory).

### `Selector`
- TODO(redesign): surface-2 button-style selector for enum values.

## TODO(redesign)

- Inline styles only — migrate to Griffel + a `.styles.ts`.
- All settings controls are decorative — no state wires through to backend.
- Subcomponents (`SettingsRow`, `Toggle`, `Selector`) need to be extracted as named exports so the spec can pin exact dimensions / animations.

## Porting checklist (`client/src/pages/Settings/`)

- [ ] 220px nav + 1fr content, full-height grid
- [ ] Nav: bg-1 background, right border, eyebrow `SETTINGS` at top
- [ ] Nav buttons: green-soft + green text + 2px green left border when active
- [ ] Content: Anton 40px uppercase title, eyebrow above
- [ ] Body max-width 640px
- [ ] URL deep-link: `?section=<id>`, validated against the SectionId set
- [ ] Default to "general" when section param missing/invalid
- [ ] Six sections: General, Library, Playback, Metadata, Account, Danger zone
- [ ] Wire each setting through to `user_settings` (or matching) backend table
- [ ] Toggle switch: 38×20, green when active
- [ ] Danger zone: separate visual treatment (red?) — confirm against redesign

## Status

- [ ] Designed in `design/Release` lab (baseline reflects current state)
- [ ] Production implementation
