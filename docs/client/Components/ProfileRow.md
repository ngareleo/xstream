# ProfileRow

One library row in the Profiles tree view. Displays the profile name, path, match progress, size, and EDIT link. Expandable to reveal nested FilmRow children.

**Source:** `client/src/components/profile-row/`
**Used by:** `ProfilesPage` (tree view grid).

## Role

Leaf row component for the Profiles tree. Uses a 5-column grid layout shared with `FilmRow` via the `PROFILE_GRID_COLUMNS` constant imported from `pages/Profiles/grid.ts`. Handles expansion toggle, scanning state display, and navigation to the edit page.

## Props

| Prop | Type | Notes |
|---|---|---|
| `profile` | `ProfileShape` | The library object (name, path, scanning, scanProgress, totalSize, etc.). |
| `expanded` | `boolean` | Whether the profile's children are currently visible. |
| `onToggleExpand` | `(profileId: string) => void` | Callback on row click (toggle expansion). |
| `children` | `React.ReactNode` | Nested FilmRow elements. Rendered only when `expanded && children.length > 0`. |

## Layout & styles

### Row container

- 5-column CSS grid: `gridTemplateColumns: PROFILE_GRID_COLUMNS` (`"30px 1.3fr 0.7fr 0.6fr 80px"`).
- `padding: 11px 24px`, `columnGap: 16px`, `cursor: pointer`.
- `background: colorSurface` when expanded; transparent otherwise.

### Column 1: Chevron

- `<IconChevron>` (20×20 or similar).
- Rotated 90° when expanded via `transform: rotate(90deg)`.
- Transition: `transitionProperty: transform`, `transitionDuration: 0.15s`.

### Column 2: Profile name + path + status pill

- Two-line stack:
  - **Line 1:** name (13px, `color: colorText`).
  - **Line 2:** path (Mono 10px, `color: colorTextMuted`, `letterSpacing: 0.04em`) followed by a status pill.
- **Status pill (`.statusPill`):** Mono 9px, `letterSpacing: 0.18em`, uppercase. Three states driven by `Library.status` from the GraphQL fragment:
  - `ONLINE` → `● online` in `colorGreen`.
  - `OFFLINE` → `○ offline` in `colorRed`.
  - `UNKNOWN` → `○ unknown` in `colorTextFaint`.
- Pill `title` attribute carries `last seen <timestamp>` from `Library.lastSeenAt` (or `not yet probed` when null).
- Driven by `services::profile_availability` — see [`docs/architecture/Library-Scan/04-Profile-Availability.md`](../../architecture/Library-Scan/04-Profile-Availability.md).

### Column 3: Match progress bar

- Flex row, `alignItems: center`, `columnGap: 8px`.
- **During scan** (`profile.scanning`):
  - **Spinner:** 10×10, `border: 1.5px solid colorGreen`, `border-top: transparent`, `animation: spin 0.9s linear infinite`.
  - **Label:** Mono 10px green, `"{done}/{total}"`.
- **Otherwise:**
  - **Progress bar:** 3px tall, `background: colorSurface2`, filled to `matchPct` width with green (or yellow when `unmatched > 0`).
  - **Label:** Mono 10px (yellow if unmatched, else muted), `"{round(matchPct)}%"`.

### Column 4: Size

- Mono 11px, `color: colorTextDim`, right-aligned.
- Renders formatted file size (e.g., "12.3 GB").

### Column 5: Actions

- Mono 9px, `letterSpacing: 0.12em`, `color: colorTextMuted`, right-aligned.
- **While scanning:** `"SCANNING…"` (non-interactive text).
- **Otherwise:** `.editLink` — green Mono 9px, `letterSpacing: 0.16em`, underline with 3px offset, transitions on hover to white. Reads `"EDIT"` and links to `/profiles/:profileId/edit`. Uses `e.stopPropagation()` to prevent toggle on click.

### Expanded children

- Rendered only when `expanded && children.length > 0`.
- Container: `paddingLeft: 30px`, `background: colorBg1`, flex column.
- Houses the nested FilmRow children.

## Behaviour

### Click behaviour

- Clicking anywhere on the row (except the EDIT link) calls `onToggleExpand(profile.id)`.
- The EDIT link uses `e.stopPropagation()` to prevent toggle.

### Hover state

- Subtle background tint on hover (part of parent page-level styling in ProfilesPage, not isolated to this component).

## Data

```graphql
fragment ProfileRow_library on Library {
  id
  name
  path
  status
  lastSeenAt
  stats { totalCount matchedCount unmatchedCount totalSizeBytes }
}
```

`status` and `lastSeenAt` populate the status pill. The rest of the row (`stats`) drives the match-progress and size columns.

## Notes

**Grid layout sharing:** ProfileRow and FilmRow both use `PROFILE_GRID_COLUMNS = "30px 1.3fr 0.7fr 0.6fr 80px"` imported from `pages/Profiles/grid.ts`. This ensures column widths stay locked between parent rows and child rows, maintaining visual alignment across the tree.

**Scanning indicator:** The spinner provides a visual "loading" metaphor while the label `{done}/{total}` gives numeric feedback during active scans.

**Match bar states:** The bar color changes from green (all matched) to yellow (some unmatched) — a subtle visual cue without requiring explicit text.
