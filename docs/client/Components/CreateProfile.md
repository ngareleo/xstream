# CreateProfile (page)

Create-Profile page for adding a new media library. Renders a shared
`<ProfileForm mode="create">` component with form fields for library name,
file-system path, media type (Movies or TV Shows), and file extensions.
Submitting navigates back to `/profiles`.

**Source:** `client/src/pages/create-profile-page/`
**Used by:** Router as `/profiles/new` route, linked from Profiles footer CTA.

## Role

Library creation form. Displays a single-screen form for defining a new media
library: name (label), file-system path, media type selection (Movies or TV
Shows), and optional file-extension customization. Submitting creates the
library and returns to `/profiles`. Form state managed by `<ProfileForm>`
(shared component with EditProfile).

## Props

None — the page is a route shell. The form state and submission logic live in
`<ProfileForm>` subcomponent.

## Layout & styles

Full-height layout managed by `<ProfileForm>` component.

- **Breadcrumb**: `~ / media / profiles / new` (leaf bright, others muted).
- **Page title**: Anton 96px uppercase (split across lines, accent last line) —
  `"Add a library."`.
- **Subtitle**: 14px body font dimmed — `"Point Xstream at a folder of films or
  shows. We'll scan recursively, match titles against OMDb, and pull posters."`.
- **Form body**: flex column, `rowGap: 16px`.

## Behaviour

### URL

- Route: `/profiles/new`.
- On submit: navigates to `/profiles` (production uses GraphQL mutation).

### Form state

Form is rendered by shared `<ProfileForm mode="create">` (see [`ProfileForm.md`](ProfileForm.md)
for detailed field contract).

Initial values:
- `name`: empty string.
- `path`: empty string.
- `mediaType`: `"MOVIES"` (default preset).
- `extensions`: `[".mkv", ".mp4", ".avi", ".mov", ".m4v"]` (standard movie
  extensions).

Submit button label: `"Create"`.

## Subcomponents

### `ProfileForm`

Shared form component rendered with `mode="create"`. Props:

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

See [`ProfileForm.md`](ProfileForm.md) for full spec (field layout, media-type
selection, extension list, delete affordance).

## Notes

- **Outstanding work**: Outstanding work tracked in
  [`Outstanding-Work.md`](../../release/Outstanding-Work.md#create-profile).
- **Mutation wiring**: Production should wire the form's `onSubmit` callback to
  a GraphQL `createProfile` mutation (currently mock navigation to `/profiles`).
- **Path validation**: Production should validate that the path is accessible
  and readable before submitting.
