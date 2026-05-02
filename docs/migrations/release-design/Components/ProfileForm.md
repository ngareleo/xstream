# ProfileForm (component)

> Status: **baseline** (Spec) · **not started** (Production)
> Spec updated: 2026-05-02 — Browse button now toggles a `<DirectoryBrowser>` popover (offline mock filesystem) that writes the picked path back into the Path input. Button fills green when popover is open (`browseBtnActive` state). Popover positioned absolutely below the Path field, full-width, with `zIndex: 20`.

## Files

- `design/Release/src/components/ProfileForm/ProfileForm.tsx`
- `design/Release/src/components/ProfileForm/ProfileForm.styles.ts`
- Prerelease behavioural reference: Dashboard's inline NewProfilePane form shape

## Purpose

Shared form component for creating and editing profiles. Encapsulates the full form UI — breadcrumb, page title, eyebrow, form fields (name, path with file browser, media type segmented control, extension chip toggles), footer buttons, and (in edit mode) a delete confirm panel. Used by both [`CreateProfile.md`](CreateProfile.md) and [`EditProfile.md`](EditProfile.md) pages.

## Visual

### Page shell
- Full-height flex column, `paddingTop: tokens.headerHeight` (page manages header clearance like Profiles does).
- `boxSizing: border-box`, `backgroundColor: tokens.colorBg1`.

### Breadcrumb
- `height: 38px`, `paddingLeft: 24px`, `paddingRight: 24px`.
- Renders `crumbs` array as path-style breadcrumb with `/` separators; leaf is bright white, others muted.
- Mono 11px, `letterSpacing: 0.1em`, uppercase.

### Header block (below breadcrumb)
- Eyebrow: Mono 10px green uppercase (passed as `eyebrow` prop).
- Title: Anton 96px uppercase, split across lines (whole title is passed as `title` prop; no line-break logic in the component — the caller must format).
- Subtitle (optional): 14px body font dimmed (passed as `subtitle` prop; rendered only if present).
- `paddingLeft: 80px`, `paddingRight: 24px`, `paddingTop: 40px`, `paddingBottom: 24px`.

### Form body
- Flex column, `rowGap: 16px`.
- `paddingLeft: 80px`, `paddingRight: 24px`, `paddingBottom: 24px`.

#### Name field
- Label: "Library Name" in Mono 10px muted.
- Input: flex 1, height 40px, `paddingLeft: 12px`, `backgroundColor: tokens.colorSurface`, `border: 1px solid tokens.colorBorder`, mono 13px, `color: tokens.colorText`. Placeholder: "e.g. Movies" in muted.
- Focus: `borderColor: tokens.colorGreen`, `outline: none`.

#### Path field (with DirectoryBrowser popover)
- Container (`pathSection`): `position: relative`, flex column, `rowGap: 8px`.
- Label: "Folder Path" in Mono 10px muted.
- Row (`pathRow`): `display: flex`, `alignItems: center`, `columnGap: 8px`.
  - Input (`pathInput`): `flex: 1`, height 40px, `paddingLeft: 12px`, same styling as name field. Placeholder: "e.g. /mnt/media/films". Controlled by `path` state; updates on selection or manual edit.
  - Browse button (`browseBtn`): folder icon + "Browse" text, Mono 10px uppercase, `paddingTop: 8px`, `paddingBottom: 8px`, `paddingLeft: 12px`, `paddingRight: 12px`. `backgroundColor: transparent`, `border: 1px solid tokens.colorBorder`, `color: tokens.colorTextDim`. On hover: `borderColor: tokens.colorGreen`, `color: tokens.colorGreen`. Toggles `browseOpen` state.
  - Browse button active state (`browseBtnActive`): `backgroundColor: tokens.colorGreen`, `color: tokens.colorGreenInk`, `borderColor: tokens.colorGreen`. `:hover` locked to green bg (no flicker).
- Popover (`browserFloat`): `position: absolute`, `top: 100%`, `left: 0`, `right: 0`, `marginTop: 6px`, `zIndex: 20`. Renders the `<DirectoryBrowser>` component (see [`DirectoryBrowser.md`](DirectoryBrowser.md) for details). On selection, `onSelect(pickedPath)` updates the Path input and closes the popover. On cancel, closes the popover without changing the path.

#### Media Type segmented control
- Label: "Type" in Mono 10px muted.
- Two segments: "MOVIES" and "TV_SHOWS" (mapped from the `MediaType` union).
- Flex row, `columnGap: 8px`.
- Unselected: `backgroundColor: tokens.colorSurface`, `border: 1px solid tokens.colorBorder`, `color: tokens.colorTextMuted`, Mono 11px, `paddingLeft: 12px`, `paddingRight: 12px`, `height: 40px`, `cursor: pointer`.
- Selected: `backgroundColor: tokens.colorGreen`, `color: tokens.colorGreenInk`, `borderColor: tokens.colorGreen`.

#### Extension chip toggles
- Label: "File Types" in Mono 10px muted.
- Flex wrap row, `columnGap: 8px`, `rowGap: 8px`.
- Each chip (e.g. ".mkv", ".mp4"): Mono 10px, `paddingLeft: 8px`, `paddingRight: 8px`, `paddingTop: 6px`, `paddingBottom: 6px`, `borderRadius: 3px`, `cursor: pointer`, `transition: background-color, border-color, color 0.15s`.
- Unselected: `backgroundColor: tokens.colorSurface`, `border: 1px solid tokens.colorBorder`, `color: tokens.colorTextMuted`.
- Selected: `backgroundColor: tokens.colorGreen`, `color: tokens.colorGreenInk`, `borderColor: tokens.colorGreen`.
- **Preset buttons** (MOVIES / TV_SHOWS): appear above the chip grid. Each preset button pre-selects the standard extensions for that media type.
  - Label: "PRESET: MOVIES" or "PRESET: TV_SHOWS" in Mono 9px green.
  - On click: sets `mediaType` and `extensions` to the preset.

### Delete confirm panel (in `mode="edit"` only)
- Below the form fields, red-bordered panel (`border: 2px solid tokens.colorRed` or similar warning red).
- Content: "Are you sure? This cannot be undone." in 14px body font dimmed.
- Two buttons: "Delete" (red text, transparent bg, Mono 11px) + "Cancel" (same style, green text).
- On click outside or "Cancel": hides the panel.
- On "Delete": mock navigates to `/profiles`; production calls the delete mutation.

### Footer (sticky bottom)
- Flex row, `justifyContent: space-between`, `paddingLeft: 80px`, `paddingRight: 24px`, `paddingTop: 12px`, `paddingBottom: 12px`.
- Buttons: textAction-styled links (like DetailPane's action row).
  - "← Back" (left): textAction green underline, links to `/profiles`.
  - "Create" or "Save" (right, depending on `mode`): textAction green underline, onClick triggers `handleSubmit`.
  - In edit mode, a red "Delete" button may also appear here (or the inline delete panel below the form replaces it).

## Behaviour

### Form validation
- `name` and `path` are required. On submit, if either is empty/whitespace: shows an error message (mock — no actual validation visual).
- Extensions: at least one must be selected (preset enforcement).

### State management
- Managed locally via `useState`: `name`, `path`, `mediaType`, `extensions`, `error`, `confirmDelete` (for edit mode delete confirm).

### Submission
- `handleSubmit()` checks validation, then calls `navigate("/profiles")` (mock — production wires to GraphQL mutation).

### Edit-mode specifics
- Delete confirm panel starts hidden; toggle on click of a delete button.
- If the user confirms delete, the component calls the delete mutation (mock — just navigates).

## Changes from Prerelease

- **Extraction:** OLD — NewProfilePane was an inline form inside Dashboard. NEW — ProfileForm is a reusable component shared by CreateProfile and EditProfile.
- **Delete affordance:** OLD — not present in Prerelease. NEW — inline red-bordered confirm panel in edit mode.
- **Styling:** Applied to the Release identity — green tokens, Anton titles, Mono labels, glass-effect removed in favor of flat surfaces.

## Porting checklist (`client/src/components/ProfileForm/`)

- [ ] Flex column full-height layout with header clearance (`paddingTop: tokens.headerHeight`, `boxSizing: border-box`)
- [ ] Breadcrumb path rendering from `crumbs` array prop
- [ ] Eyebrow (Mono green uppercase) from `eyebrow` prop
- [ ] Title (Anton 96px uppercase) from `title` prop — caller responsible for line breaks
- [ ] Optional subtitle (14px body dimmed) from `subtitle` prop
- [ ] Name field: label + input with placeholder, focus border green
- [ ] Path field: `pathSection` relative container with `pathRow` (input + Browse button)
- [ ] Browse button: folder icon + "Browse" text, Mono uppercase, transparent bg at rest; green border + green text on hover; green bg when active
- [ ] DirectoryBrowser popover: `position: absolute` below input, `top: 100%`, `left: 0`, `right: 0`, `zIndex: 20`; renders `<DirectoryBrowser initialPath={path}>` with `onSelect(picked)` updating input and closing popover
- [ ] Media type segmented control: two segments (MOVIES / TV_SHOWS) with preset buttons
- [ ] Extension chip grid: toggles for each extension, preset buttons for standard sets
- [ ] Form validation: require name and path; show error on submit if validation fails (mock)
- [ ] Delete confirm panel (edit mode only): red-bordered, inline confirm with message + Delete/Cancel buttons
- [ ] Footer buttons: "← Back" (link to `/profiles`) + "Create" / "Save" (textAction style); red "Delete" button in edit mode
- [ ] On submit: validate, then call `createProfile` / `updateProfile` / `deleteProfile` mutations (or navigate to `/profiles` if mutations are mocked)
- [ ] Wire DirectoryBrowser to real GraphQL `listDirectory(path)` query (currently mocked with offline filesystem)
- [ ] Wire form submission to actual GraphQL mutations (replace mock navigation)

## Status

- [x] Designed in `design/Release` lab — ProfileForm component extracted for CreateProfile + EditProfile pages, DirectoryBrowser popover integrated into Path field, Browse button toggles popover + fills green when open. 2026-05-02, PR #48.
- [ ] Production implementation
