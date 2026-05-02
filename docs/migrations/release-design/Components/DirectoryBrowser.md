# DirectoryBrowser

> Status: **baseline** (Spec) · **not started** (Production)
> Spec created: 2026-05-02 — Popover component for picking a folder from a mocked filesystem. Integrates into `ProfileForm` as the Browse popover. Offline mock provides `/`, `/home`, `/media`, `/mnt`, `/var` etc; production will wire to GraphQL `listDirectory(path)` query.

## Files

- `design/Release/src/components/DirectoryBrowser/DirectoryBrowser.tsx`
- `design/Release/src/components/DirectoryBrowser/DirectoryBrowser.styles.ts`
- `design/Release/src/components/DirectoryBrowser/mockFs.ts` — offline mock filesystem with `listDirectory(path)` function

## Purpose

Popover file-system browser used by the ProfileForm Path field. User navigates directories and selects a folder to populate the parent form's path input. The component is pure-visual; production will swap the mock `listDirectory` for a GraphQL query.

## Visual

### Container
- `backgroundColor: tokens.colorSurface`, `border: 1px solid tokens.colorBorder`, `borderRadius: tokens.radiusSm`.
- `maxHeight: 300px`, `overflowY: auto` (scrollable content area).
- Box shadow for depth (floated over the form).

### Breadcrumb trail (top)
- `paddingTop: 12px`, `paddingLeft: 12px`, `paddingRight: 12px`.
- Path segments rendered as `/` + segment name, with each segment clickable to navigate up the tree.
- Mono 11px, `color: tokens.colorText`, active segment bright; prior segments muted.
- On click: navigate to that ancestor path.

### Directory listing (main content)
- `paddingLeft: 12px`, `paddingRight: 12px`, `paddingTop: 8px`, `paddingBottom: 12px`.
- Flex column, `rowGap: 4px`.
- Each directory entry: `display: flex`, `alignItems: center`, `columnGap: 8px`, `paddingTop: 6px`, `paddingBottom: 6px`, `cursor: pointer`.
- Folder icon (chevron-right or folder emoji) + folder name (Mono 12px).
- On hover: `backgroundColor: rgba(232, 238, 232, 0.08)`, `color: tokens.colorGreen` (text tints green).
- On click: navigate into that directory, update breadcrumb, re-list contents.

### Footer (bottom)
- `paddingTop: 8px`, `paddingBottom: 12px`, `paddingLeft: 12px`, `paddingRight: 12px`.
- `borderTopWidth: 1px`, `borderTopStyle: solid`, `borderTopColor: tokens.colorBorderSoft`.
- Flex row, `justifyContent: space-between`, `alignItems: center`.
- **Current path display** (left): Mono 10px, `color: tokens.colorTextMuted`, displays the full path string (e.g. `/media/films`).
- **Button group** (right): `columnGap: 8px`.
  - "Cancel" button: Mono 10px, transparent bg, `color: tokens.colorText`, no border, `cursor: pointer`. Hover: `color: tokens.colorGreen`.
  - "Select" button (CTA): Mono 10px, `backgroundColor: tokens.colorGreen`, `color: tokens.colorGreenInk`, no border, filled pill shape, `cursor: pointer`. Hover: brightness slightly increased.

## Behaviour

### State management
- Controlled `currentPath` state (initialized to `initialPath` prop, typically `"/"` or the user's last-picked path).
- On directory click: set `currentPath = clicked_directory`, re-list contents.
- On breadcrumb click: set `currentPath = ancestor_path`, re-list contents.

### Callbacks
- `onSelect(path: string)`: fires when user clicks "Select"; parent closes the popover and updates the form input.
- `onCancel()`: fires when user clicks "Cancel"; parent closes the popover without changing the path.

### Mock filesystem
- Offline mock (`mockFs.ts`) provides `listDirectory(path: string): DirectoryEntry[]`.
- Returns an array of folder entries (no files; only folders for the browsing UX).
- Mirrors the production GraphQL `listDirectory` query shape: `{ name: string; path: string; type: "directory" }[]`.
- Seed directories: `/`, `/home`, `/media`, `/mnt`, `/var`, `/usr/local`, etc. Nested to depth 2 or 3 for realistic navigation.

## Subcomponents

None.

## Changes from Prerelease

This component is new in Release — no Prerelease equivalent.

## TODO(redesign)

- Production `listDirectory` implementation: replace `mockFs.listDirectory()` with a GraphQL query `listDirectory(path)` that returns real filesystem entries from the server.
- Symlink handling: decide whether to follow symlinks or skip them.
- Permission errors: mock currently ignores permission-denied cases; production should show "access denied" message for inaccessible folders.

## Porting checklist (`client/src/components/DirectoryBrowser/`)

- [ ] Container with `backgroundColor: colorSurface`, `border: 1px solid colorBorder`, `maxHeight: 300px`, `overflowY: auto`, box shadow for depth
- [ ] Breadcrumb trail: `/`-separated path segments, each clickable to navigate up; current segment bright, prior segments muted
- [ ] Directory listing: folder icon + folder name (Mono 12px), flex column `rowGap: 4px`
- [ ] Directory entry on hover: `backgroundColor: rgba(232, 238, 232, 0.08)`, `color: colorGreen`
- [ ] Click directory to navigate in; update breadcrumb + re-list contents
- [ ] Footer: current path display (left) + Cancel / Select button pair (right)
- [ ] "Cancel" button: white Mono text, transparent bg, hover green
- [ ] "Select" button (CTA): green bg, green-ink text, hover brighten; calls `onSelect(currentPath)`
- [ ] `initialPath` prop (defaults to `"/"`)
- [ ] `onSelect(path)` and `onCancel()` callbacks
- [ ] Swap `mockFs.listDirectory()` for GraphQL `listDirectory(path)` query
- [ ] Handle permission errors gracefully (show "access denied" message if directory is not readable)

## Status

- [x] Designed in `design/Release` lab — DirectoryBrowser popover component 2026-05-02, PR #48. Integrated into ProfileForm as the Browse popover. Offline mock filesystem (`mockFs.ts`) provides breadcrumb + directory listing + footer (current path + Cancel / Select CTAs).
- [ ] Production implementation
