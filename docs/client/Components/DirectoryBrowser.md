# DirectoryBrowser

Popover file-system browser used by the ProfileForm Path field. User navigates directories and selects a folder to populate the parent form's path input.

**Source:** `client/src/components/directory-browser/`
**Used by:** `ProfileForm` (Browse popover on Path field).

## Role

Filesystem browser for selecting a profile library path. Renders a breadcrumb trail, directory listing, and footer with action buttons (Cancel, Select). The component accepts a GraphQL `listDirectory(path)` query to populate the directory tree at runtime.

## Props

| Prop | Type | Notes |
|---|---|---|
| `initialPath` | `string` | Starting path, typically `"/"`. |
| `onSelect` | `(path: string) => void` | Fires when user clicks Select; parent closes popover. |
| `onCancel` | `() => void` | Fires when user clicks Cancel; parent closes popover. |

## Layout & styles

### Container

- `backgroundColor: colorSurface`, `border: 1px solid colorBorder`, `borderRadius: radiusSm`.
- `maxHeight: 300px`, `overflowY: auto` (scrollable content area).
- Box shadow for depth (floated over the form).

### Breadcrumb trail (top)

- `paddingTop: 12px`, `paddingLeft: 12px`, `paddingRight: 12px`.
- Path segments rendered as `/` + segment name, with each segment clickable to navigate up the tree.
- Mono 11px, `color: colorText`, active segment bright; prior segments muted.
- On click: navigate to that ancestor path.

### Directory listing (main content)

- `paddingLeft: 12px`, `paddingRight: 12px`, `paddingTop: 8px`, `paddingBottom: 12px`.
- Flex column, `rowGap: 4px`.
- Each directory entry: `display: flex`, `alignItems: center`, `columnGap: 8px`, `paddingTop: 6px`, `paddingBottom: 6px`, `cursor: pointer`.
- Folder icon (chevron-right or folder emoji) + folder name (Mono 12px).
- On hover: `backgroundColor: rgba(232, 238, 232, 0.08)`, `color: colorGreen` (text tints green).
- On click: navigate into that directory, update breadcrumb, re-list contents.

### Footer (bottom)

- `paddingTop: 8px`, `paddingBottom: 12px`, `paddingLeft: 12px`, `paddingRight: 12px`.
- `borderTopWidth: 1px`, `borderTopStyle: solid`, `borderTopColor: colorBorderSoft`.
- Flex row, `justifyContent: space-between`, `alignItems: center`.
- **Current path display** (left): Mono 10px, `color: colorTextMuted`, displays the full path string (e.g. `/media/films`).
- **Button group** (right): `columnGap: 8px`.
  - "Cancel" button: Mono 10px, transparent bg, `color: colorText`, no border, `cursor: pointer`. Hover: `color: colorGreen`.
  - "Select" button (CTA): Mono 10px, `backgroundColor: colorGreen`, `color: colorGreenInk`, no border, filled pill shape, `cursor: pointer`. Hover: brightness slightly increased.

## Behaviour

### State management

- Controlled `currentPath` state (initialized to `initialPath` prop, typically `"/"` or the user's last-picked path).
- On directory click: set `currentPath = clicked_directory`, re-list contents.
- On breadcrumb click: set `currentPath = ancestor_path`, re-list contents.

### Callbacks

- `onSelect(path: string)`: fires when user clicks "Select"; parent closes the popover and updates the form input.
- `onCancel()`: fires when user clicks "Cancel"; parent closes the popover without changing the path.

## Data

The component queries the server with `listDirectory(path: string)` (GraphQL) to fetch directory entries as `{ name: string; path: string; type: "directory" }[]`. Only directories are shown; files are filtered from the listing.

## Notes

Outstanding work tracked in [`Outstanding-Work.md`](../../release/Outstanding-Work.md).
