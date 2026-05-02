# EditProfile (page)

> Status: **baseline** (Spec) · **not started** (Production)

## Files

- `design/Release/src/pages/EditProfile/EditProfile.tsx`
- `design/Release/src/components/ProfileForm/ProfileForm.tsx`
- `design/Release/src/components/ProfileForm/ProfileForm.styles.ts`
- Prerelease behavioural reference: library editing was not a Prerelease feature; derived from the Dashboard's NewProfilePane form shape

## Purpose

Edit-Profile page (`/profiles/:profileId/edit`). Renders a shared `<ProfileForm mode="edit">` component with the same field set as CreateProfile, pre-filled from the selected profile's data. Submitting navigates back to `/profiles`. Includes an optional delete affordance with an inline red-bordered confirm panel.

## Visual

### Page layout
- Full-height layout managed by `<ProfileForm>` component.
- Breadcrumb: `~ / media / profiles / {profile.name}` (leaf bright in white, others muted).
- Page eyebrow: Mono 10px dimmed, `"PROFILE · {profileId}"`.
- Page title: Anton 96px uppercase (split across lines), profile name.
- Subtitle: 14px body font dimmed, profile path from disk.
- Form body: flex column, `rowGap: 16px`.

## Behaviour

### URL
- Route: `/profiles/:profileId/edit`.
- Profile lookup: reads `profileId` from URL params; looks up in `data/mock.js` profiles array.
- Not found: renders `<Navigate to="/profiles" replace />`.
- On submit: navigates to `/profiles` (mock — production uses GraphQL mutation).

### Form state
- Managed by `<ProfileForm mode="edit">` (see [`ProfileForm.md`](ProfileForm.md) for detailed field contract).
- Initial values: pre-filled from the profile being edited (name, path, mediaType inferred from profile.type enum, extensions seeded from media-type presets).
- Submit button label: "Save".

### Delete affordance (in `mode="edit"`)
- Below the form fields, a red-bordered delete button.
- On click: reveals an inline confirm panel with "Are you sure? This cannot be undone." + "Delete" / "Cancel" buttons.
- On "Delete": mock navigates to `/profiles`; production wires to GraphQL delete mutation.

## Subcomponents

The form is rendered by the shared `<ProfileForm>` component (see [`ProfileForm.md`](ProfileForm.md)). EditProfile only wraps it with page-level props, mapping the profile's data into the form shape:

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

## Porting checklist (`client/src/pages/EditProfile/`)

- [ ] Read `profileId` from `useParams()`
- [ ] Look up profile from GraphQL (or mock data); render `<Navigate to="/profiles" replace />` if not found
- [ ] Render shared `<ProfileForm mode="edit" ... />`
- [ ] Pass crumbs `["media", "profiles", profile.name]`, eyebrow `"PROFILE · {profileId}"`, title `profile.name`, subtitle `profile.path`
- [ ] Submit button label `"Save"`
- [ ] Initial form values: pre-fill from profile; map `profile.type` enum to media-type ("tv" → "TV_SHOWS", else "MOVIES"); seed extensions from media-type presets
- [ ] On submit: navigate to `/profiles` (or wire to GraphQL update-profile mutation)
- [ ] Delete affordance: show delete button below form; on click reveal inline confirm panel with "Are you sure?" + Delete/Cancel buttons
- [ ] Wire to actual GraphQL `updateProfile` and `deleteProfile` mutations (replace mock navigation)

## Status

- [x] Designed in `design/Release` lab — EditProfile page with shared ProfileForm component and delete affordance inline confirm 2026-05-02, PR #48. Profile data looked up from mock; navigation is a placeholder for production GraphQL mutations.
- [ ] Production implementation
