# ProfileForm

Shared form component for creating and editing profiles. Encapsulates the full form UI — breadcrumb, page title, eyebrow, form fields (name, path with file browser, media type segmented control, extension chip toggles), footer buttons, and (in edit mode) a delete confirm panel.

**Source:** `client/src/components/profile-form/`
**Used by:** `CreateProfilePage`, `EditProfilePage`.

## Role

Reusable form container for profile creation and editing workflows. Handles validation, state management, and submission via GraphQL mutations. In edit mode, includes a red-bordered delete confirmation panel.

## Props

| Prop | Type | Notes |
|---|---|---|
| `mode` | `"create" \| "edit"` | Changes button labels and footer logic. |
| `crumbs` | `string[]` | Breadcrumb path segments. |
| `eyebrow` | `string` | Mono green uppercase line (e.g., "Library"). |
| `title` | `string` | Anton 96px uppercase title; caller responsible for line breaks. |
| `subtitle` | `string \| undefined` | Optional 14px dimmed subtitle. |
| `initialProfile` | `ProfileShape \| undefined` | In edit mode, the profile to load (name, path, extensions, mediaType). |
| `onSubmit` | `(data) => void` | Fires on Create/Save; receives form data. |

## Layout & styles

### Page shell

- Full-height flex column, `paddingTop: headerHeight` (page manages header clearance).
- `boxSizing: border-box`, `backgroundColor: colorBg1`.

### Breadcrumb

- `height: 38px`, `paddingLeft: 24px`, `paddingRight: 24px`.
- Renders `crumbs` array as path-style breadcrumb with `/` separators; leaf is bright white, others muted.
- Mono 11px, `letterSpacing: 0.1em`, uppercase.

### Header block (below breadcrumb)

- **Eyebrow:** Mono 10px green uppercase.
- **Title:** Anton 96px uppercase (whole title is passed as `title` prop; caller manages line breaks).
- **Subtitle** (optional): 14px body font dimmed (rendered only if present).
- Padding: `paddingLeft: 80px`, `paddingRight: 24px`, `paddingTop: 40px`, `paddingBottom: 24px`.

### Form body

- Flex column, `rowGap: 16px`.
- `paddingLeft: 80px`, `paddingRight: 24px`, `paddingBottom: 24px`.

#### Name field

- **Label:** "Library Name" in Mono 10px muted.
- **Input:** `flex: 1`, `height: 40px`, `paddingLeft: 12px`, `backgroundColor: colorSurface`, `border: 1px solid colorBorder`, Mono 13px, `color: colorText`. Placeholder: "e.g. Movies" (muted).
- **Focus:** `borderColor: colorGreen`, `outline: none`.

#### Path field (with DirectoryBrowser popover)

- **Container** (`pathSection`): `position: relative`, flex column, `rowGap: 8px`.
- **Label:** "Folder Path" in Mono 10px muted.
- **Row** (`pathRow`): `display: flex`, `alignItems: center`, `columnGap: 8px`.
  - **Input** (`pathInput`): `flex: 1`, `height: 40px`, `paddingLeft: 12px`, same styling as name field. Placeholder: "e.g. /mnt/media/films". Controlled by `path` state.
  - **Browse button** (`browseBtn`): folder icon + "Browse" text, Mono 10px uppercase, `paddingTop/Bottom: 8px`, `paddingLeft/Right: 12px`. Default: transparent bg, `border: 1px solid colorBorder`, `color: colorTextDim`. Hover: `borderColor: colorGreen`, `color: colorGreen`. Active (popover open): `backgroundColor: colorGreen`, `color: colorGreenInk`, `borderColor: colorGreen`; hover stays green (no flicker).
- **Popover** (`browserFloat`): `position: absolute`, `top: 100%`, `left: 0`, `right: 0`, `marginTop: 6px`, `zIndex: 20`. Renders `<DirectoryBrowser initialPath={path}>` with `onSelect(pickedPath)` updating the input and closing the popover.

#### Media Type segmented control

- **Label:** "Type" in Mono 10px muted.
- **Segments:** Two buttons — "MOVIES" and "TV_SHOWS" (mapped from `MediaType` union).
- Layout: `display: flex`, `columnGap: 8px`.
- Unselected: `backgroundColor: colorSurface`, `border: 1px solid colorBorder`, `color: colorTextMuted`, Mono 11px, `paddingLeft/Right: 12px`, `height: 40px`, `cursor: pointer`.
- **Selected:** `backgroundColor: colorGreen`, `color: colorGreenInk`, `borderColor: colorGreen`.
- **Segment hint line** (`.segmentHint`): Mono 9px muted, rendered below the buttons. Text changes per segment:
  - **MOVIES:** `"Each video file is matched as a single film."`
  - **TV_SHOWS:** `"Files are grouped by show, then by season folder. Episode numbers are read from filenames (S01E03, 1x03, etc.)."`

#### Extension chip toggles

- **Label:** "File Types" in Mono 10px muted.
- **Preset buttons** (above chips): "PRESET: MOVIES" and "PRESET: TV_SHOWS" in Mono 9px green. On click, pre-selects the standard extensions for that type.
- **Chip grid:** Flex wrap row, `columnGap: 8px`, `rowGap: 8px`.
  - Each chip (e.g. ".mkv", ".mp4"): Mono 10px, `paddingLeft/Right: 8px`, `paddingTop/Bottom: 6px`, `borderRadius: 3px`, `cursor: pointer`, `transition: background-color, border-color, color 0.15s`.
  - Unselected: `backgroundColor: colorSurface`, `border: 1px solid colorBorder`, `color: colorTextMuted`.
  - **Selected:** `backgroundColor: colorGreen`, `color: colorGreenInk`, `borderColor: colorGreen`.

### Delete confirm panel (edit mode only)

- Below the form fields, red-bordered panel (`border: 2px solid colorRed` or similar warning red).
- Content: "Are you sure? This cannot be undone." in 14px body font dimmed.
- Two buttons: "Delete" (red text, transparent bg, Mono 11px) + "Cancel" (same style, green text).
- On click outside or "Cancel": hides the panel. On "Delete": calls the delete mutation.

### Footer (sticky bottom)

- Flex row, `justifyContent: space-between`, `paddingLeft: 80px`, `paddingRight: 24px`, `paddingTop/Bottom: 12px`.
- Buttons: textAction style (green underline).
  - "← Back" (left): links to `/profiles`.
  - "Create" or "Save" (right, depending on `mode`): calls `handleSubmit`.
  - In edit mode, a red "Delete" button may appear here.

## Behaviour

### Form validation

- `name` and `path` are required. On submit, if either is empty/whitespace, shows an error message.
- Extensions: at least one must be selected (preset enforcement).

### State management

- Locally managed via `useState`: `name`, `path`, `mediaType`, `extensions`, `error`, `browseOpen` (popover visibility), `confirmDelete` (edit mode).

### Submission

- `handleSubmit()` validates, then calls the appropriate GraphQL mutation (`createProfile` or `updateProfile`).

### Edit-mode specifics

- Delete confirm panel starts hidden; toggles on click of a delete button.
- If confirmed, calls the `deleteProfile` mutation.

## Data

Form receives initial profile data via the `initialProfile` prop (in edit mode). No Relay fragments — values are passed as props and lifted to the parent page.

## Notes

Outstanding work tracked in [`Outstanding-Work.md`](../../release/Outstanding-Work.md).
