# EditProfile (page)

Edit-Profile page for modifying an existing media library. Renders a shared
`<ProfileForm mode="edit">` component with form fields pre-filled from the
selected profile's data. Submitting saves changes and returns to `/profiles`.
Includes an optional delete affordance with an inline confirmation panel.

**Source:** `client/src/pages/edit-profile-page/`
**Used by:** Router as `/profiles/:profileId/edit` route, linked from
Profiles page detail pane or library context menu.

## Role

Library edit form. Displays a single-screen form for modifying an existing
library: name, path, media type, file extensions. Pre-fills all fields from
the selected profile. Submitting updates the library and returns to
`/profiles`. Includes a delete button below the form that reveals an inline
confirmation panel ("Are you sure? This cannot be undone.") with Delete /
Cancel options. Form state managed by `<ProfileForm>` (shared component with
CreateProfile).

## Props

None — the page is a route shell. Reads `profileId` from URL params via
`useParams()`. Looks up profile from Relay query; renders `<Navigate to="/profiles"
replace />` if not found.

## Layout & styles

Full-height layout managed by `<ProfileForm>` component.

- **Breadcrumb**: `~ / media / profiles / {profile.name}` (leaf bright, others
  muted).
- **Page eyebrow**: Mono 10px dimmed — `"PROFILE · {profileId}"`.
- **Page title**: Anton 96px uppercase (split across lines) — profile name.
- **Subtitle**: 14px body font dimmed — profile path from disk.
- **Form body**: flex column, `rowGap: 16px`.
- **Delete affordance** (below form fields): red-bordered delete button. On
  click reveals inline confirm panel: `"Are you sure? This cannot be undone."` +
  Delete / Cancel buttons.

## Behaviour

### URL

- Route: `/profiles/:profileId/edit`.
- Profile lookup: reads `profileId` from URL params; looks up in Relay query.
- Not found: renders `<Navigate to="/profiles" replace />`.
- On submit: navigates to `/profiles` (production uses GraphQL mutation).

### Form state

Form is rendered by shared `<ProfileForm mode="edit">` (see [`ProfileForm.md`](ProfileForm.md)
for detailed field contract).

Initial values pre-filled from profile:
- `name`: `profile.name`.
- `path`: `profile.path`.
- `mediaType`: `profile.type === "tv" ? "TV_SHOWS" : "MOVIES"`.
- `extensions`: seeded from media-type presets based on `mediaType`.

Submit button label: `"Save"`.

### Delete affordance

- Red-bordered delete button positioned below form fields.
- On click: reveals inline confirm panel with `"Are you sure? This cannot be
  undone."` message + two buttons:
  - **Delete**: calls `onConfirmDelete()` → mock navigates to `/profiles`;
    production wires to GraphQL `deleteProfile` mutation.
  - **Cancel**: closes confirm panel, reverts to normal form state.

## Subcomponents

### `ProfileForm`

Shared form component rendered with `mode="edit"`. Props:

```tsx
<ProfileForm
  mode="edit"
  crumbs={["media", "profiles", profile.name]}
  eyebrow={`PROFILE · ${profile.id}`}
  title={profile.name}
  subtitle={profile.path}
  submitLabel="Save"
  initial={{
    name: profile.name,
    path: profile.path,
    mediaType: profile.type === "tv" ? "TV_SHOWS" : "MOVIES",
    extensions: /* preset from media-type */,
  }}
/>
```

See [`ProfileForm.md`](ProfileForm.md) for full spec (field layout, media-type
selection, extension list, delete affordance).

## Data

### Relay query

- Root query: `EditProfilePageQuery` fetching the profile by `profileId`.
- Profile fields: `id`, `name`, `path`, `type` ("movies" or "tv"), file count,
  match status, scanning state.

## Notes

- **Outstanding work**: Outstanding work tracked in
  [`Outstanding-Work.md`](../../release/Outstanding-Work.md#edit-profile).
- **Mutation wiring**: Production should wire the form's `onSubmit` callback to
  a GraphQL `updateProfile` mutation, and the delete button to a `deleteProfile`
  mutation (currently mock navigation).
- **Path validation**: Production should validate path changes (accessibility,
  readability) before submitting.
- **Profile not found**: If the `profileId` is invalid, the page navigates away
  via `<Navigate replace>`, preserving browser history cleanly.
