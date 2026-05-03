# Settings (page)

App settings page. Two-pane layout: left nav (220px) + right content pane.
Sections include General, Library, Playback, Metadata, Account, Danger zone.
URL-driven section selection via `?section=<id>` search param. Delegates
settings state to tab/section child components and backing services.

**Source:** `client/src/pages/settings-page/`
**Used by:** Router as `/settings` route.

## Role

User-facing settings shell. Left nav displays section buttons; right pane
contains the active section's UI (form fields, toggles, text inputs). Section
state persists via backend mutations (GraphQL `setSetting`, user settings
table). Each section manages its own state; the page shell provides routing
and nav layout.

## Props

None — the page is a route shell. Reads and writes URL search param
`?section=<id>` via `useSearchParams()`. Sections are rendered conditionally
based on active selection.

## Layout & styles

### Page container (`.shell`)

- `height: 100%`, `display: grid`, `gridTemplateColumns: "220px 1fr"`,
  `overflow: hidden`.
- **`paddingTop: tokens.headerHeight`, `boxSizing: border-box`** — page manages
  header clearance.

### Left nav

- `border-right: 1px solid colorBorder`, `background: colorBg1`, `padding: 20px`,
  `display: flex; flex-direction: column; gap: 4px`.
- Eyebrow `SETTINGS` at top with `margin-bottom: 14px` (Mono 10px uppercase
  `colorTextMuted`).
- Nav button per section: `padding: 9px 12px`, no border on chrome, `font-size:
  12px`, left-aligned.
  - **Active**: `background: colorGreenSoft`, `color: colorGreen`, `border-left:
    2px solid colorGreen`, `border-radius: 2px`.
  - **Inactive**: transparent bg, `color: colorTextDim`, transparent left border
    (layout doesn't shift).

### Right content pane

- `overflow: auto`, `padding: 32px 40px`.
- Eyebrow `"· {SECTION.TOUPPERCASE()}"` in green (Mono 11px uppercase).
- Title: Anton 40px, `letter-spacing: -0.01em`, uppercase, `color: colorText`,
  `margin-top: 12px, margin-bottom: 24px`.
- Body: `max-width: 640px`, contains the section's `<SettingsRow>` definitions
  (or other controls).

## Behaviour

### Section selection

- `SectionId = "general" | "library" | "playback" | "metadata" | "account" |
  "danger"`.
- `VALID_SECTIONS` Set guards against malformed URLs.
- URL deep-link: `?section=<id>`. Reads via `useSearchParams()`.
- `setActive(id)` writes `next.set("section", id)` and pushes via
  `setParams(next)`.
- Default: `"general"` when no/invalid section param.

## Subcomponents

Three reusable settings primitives extracted to `client/src/components/`:

### `SettingsRow`

- Props: `label: string`, optional `hint: string`, `control: ReactNode`.
- Grid layout `1fr auto`, `column-gap: 16px`, `paddingTop/Bottom: 14px`,
  `borderBottom: 1px solid colorBorderSoft`.
- Label: 13px / `colorText`.
- Hint: 11px / `colorTextMuted`, `marginTop: 4px`, `lineHeight: 1.5`.
- Control rendered on right (flex-end).

### `SettingsToggle`

- Props: `on: boolean`, `onChange: (next: boolean) => void`, optional
  `ariaLabel`, `disabled`.
- 38×20, `borderRadius: radiusFull`. Off track: `colorSurface2` bg +
  `colorBorder`. On track: `colorGreen` bg + `colorGreen` border.
- Knob 14×14, slides `left: 2 → 20`. Off knob: `colorTextDim`. On knob:
  `colorGreenInk`. Transitions on `left, background-color` at
  `tokens.transition`.
- Renders as `<button role="switch">` with `aria-checked`.

### `SettingsSelector`

- Props: `value: string`, optional `onClick`, `ariaLabel`, `disabled`.
- Surface-2 button: `padding: 6 12`, `colorBorder` 1px, `radiusSm`, `fontMono
  11px / 0.08em`. Renders `value ▾` with chevron in `colorTextMuted`.
- Hover (when not disabled) lights border green. No live consumer in production
  (controls are inputs/buttons, not enum selectors); primitive ready for
  adoption.

## Production deviations from spec

- **Functional tabs**: Production keeps 5 functional tabs (`library`, `metadata`,
  `flags`, `trace`, `danger`) instead of the spec's 6 decorative sections
  (`general`, `playback`, `account` have no backing services).
- **Relay query placement**: `TraceHistoryTab` runs its own
  `useLazyLoadQuery<TraceHistoryTabQuery>` and is wrapped in a `<Suspense>`
  boundary at page level, so other sections don't pay for the playback-history
  fetch. This is documented as a section-tab exception in Client-Conventions.
- **URL param**: Hard-switch from prior `?tab=<id>` to `?section=<id>` (no
  back-compat redirect; xstream is desktop-bundled, not SEO-indexed).

## Notes

- **Outstanding work**: Outstanding work tracked in
  [`Outstanding-Work.md`](../../release/Outstanding-Work.md#settings).
- Settings mutations persist to the `user_settings` SQLite table via
  `setSetting` GraphQL mutation.
- Toggle switches use `SettingsToggle` primitive for consistency across all
  boolean settings (e.g., feature flags).
- Danger zone: separate visual treatment with red borders and red text (shared
  `dangerZone` / `btnDanger` styles).
