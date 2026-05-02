# CreateProfile (page)

> Status: **baseline** (Spec) · **not started** (Production)

## Files

- `design/Release/src/pages/CreateProfile/CreateProfile.tsx`
- `design/Release/src/components/ProfileForm/ProfileForm.tsx`
- `design/Release/src/components/ProfileForm/ProfileForm.styles.ts`
- Prerelease behavioural reference: `design/Prerelease/src/pages/Dashboard/` (Dashboard's inline NewProfilePane form, now extracted and refactored)

## Purpose

Create-Profile page (`/profiles/new`). Renders a shared `<ProfileForm mode="create">` component with form fields for library name, file-system path, media type, and file extensions. Submitting navigates back to `/profiles`.

## Visual

### Page layout
- Full-height layout managed by `<ProfileForm>` component.
- Breadcrumb: `~ / media / profiles / new` (leaf bright in white, others muted).
- Page title: Anton 96px uppercase (split across lines, accent last line), "Add a library.".
- Subtitle: 14px body font dimmed, "Point Xstream at a folder of films or shows. We'll scan recursively, match titles against OMDb, and pull posters."
- Form body: flex column, `rowGap: 16px`.

## Behaviour

### URL
- Route: `/profiles/new`.
- On submit: navigates to `/profiles` (mock — production uses GraphQL mutation).
- Breadcrumb is rendered by `<ProfileForm>` component, not locally.

### Form state
- Managed by `<ProfileForm mode="create">` (see [`ProfileForm.md`](ProfileForm.md) for detailed field contract).
- Initial values: all fields empty or preset to MOVIES media type with standard movie extensions.

## Subcomponents

The form is rendered by the shared `<ProfileForm>` component (see [`ProfileForm.md`](ProfileForm.md)). CreateProfile only wraps it with page-level props:

```tsx
<ProfileForm
  mode="create"
  crumbs={["media", "profiles", "new"]}
  eyebrow="NEW PROFILE"
  title="Add a library."
  subtitle="Point Xstream at a folder of films or shows. We'll scan recursively, match titles against OMDb, and pull posters."
  submitLabel="Create"
  initial={{
    name: "",
    path: "",
    mediaType: "MOVIES",
    extensions: [".mkv", ".mp4", ".avi", ".mov", ".m4v"],
  }}
/>
```

## Porting checklist (`client/src/pages/CreateProfile/`)

- [ ] Render shared `<ProfileForm mode="create" ... />`
- [ ] Pass crumbs `["media", "profiles", "new"]`, eyebrow `"NEW PROFILE"`, title `"Add a library."`, subtitle text
- [ ] Submit button label `"Create"`
- [ ] Initial form values: empty name/path, media type MOVIES, standard movie extensions preset
- [ ] On submit: navigate to `/profiles` (or wire to GraphQL create-profile mutation)
- [ ] Wire to actual GraphQL `createProfile` mutation (replace mock navigation)

## Status

- [x] Designed in `design/Release` lab — extracted from Dashboard's inline NewProfilePane form and ported to dedicated CreateProfile page with shared ProfileForm component 2026-05-02, PR #48.
- [ ] Production implementation
