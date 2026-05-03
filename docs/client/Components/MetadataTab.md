# MetadataTab

OMDb API key configuration section in Settings. Allows users to set their OMDb
API key for automatic movie metadata matching (title, poster, rating, plot).
Single input field with save button and success feedback.

**Source:** `client/src/components/metadata-tab/`
**Used by:** SettingsPage right-pane, conditional render when `section=metadata`.

## Role

Settings tab for configuring the OMDb API key. Collects user input, validates
non-empty, and persists to the backend's `user_settings` table via the
`setSetting` GraphQL mutation.

## Queries & mutations

### Mutation: `MetadataTabSetKeyMutation`

```graphql
mutation MetadataTabSetKeyMutation($key: String!, $value: String!) {
  setSetting(key: $key, value: $value)
}
```

- **Variables**:
  - `key: "omdbApiKey"` — setting identifier.
  - `value: string` — user-supplied API key.
- **Response**: Boolean (1 on success, 0 on failure; not inspected by
  component).
- **Pending state**: Button text changes to "Saving…" and disables while the
  mutation is in flight.
- **Complete state**: On success, displays "API key saved." below the button.

## Layout & styles

- Uses `useSettingsTabStyles()` from `SettingsTabs.styles.ts`.
- **Section wrapper** — `className={styles.section}`.
- **Title** — `sectionTitle` class: "OMDb API Key", 13px, bold.
- **Description** — `sectionDesc` class: Multi-line explanation of OMDb,
  free-tier limits, and link to omdbapi.com.
- **Input label** — `styles.label`: "API Key", 10px, uppercase, bold.
- **Input field** — `styles.input`:
  - `type="password"` for obfuscation.
  - `placeholder="e.g. abc12345"`.
  - `autoComplete="off"`.
  - Width: 100%.
  - Focus: border turns green.
- **Button** — `styles.btn`: Green button, disabled while `isPending` or when
  input is empty (`!apiKey`).
  - Text: "Save Key" (idle) or "Saving…" (pending).
  - `onClick`: Calls `handleSave()`.
- **Success message** — `styles.successMsg`: Rendered conditionally when
  `saved` is true. Text: "API key saved."

## Behaviour

- Component owns local state:
  - `apiKey: string` — form input value.
  - `saved: boolean` — success message display flag.
  - `isPending: boolean` — mutation pending state (from `useMutation` hook).
- Input flow:
  1. User types into the password field.
  2. `onChange` updates local `apiKey` state.
  3. Button enables only if `apiKey` is non-empty AND mutation is not pending.
- Submit flow:
  1. User clicks "Save Key" button.
  2. `handleSave()` resets `saved` to false, calls mutation with `{ key:
     "omdbApiKey", value: apiKey }`.
  3. Button disables and text changes to "Saving…" (`isPending` === true).
  4. Mutation completes.
  5. `onCompleted` fires, `setSaved(true)`.
  6. Success message appears; button re-enables if `apiKey` still non-empty.
- No confirmation or validation (e.g., API key format check) — server validates
  the key on first metadata fetch.

## Data

Relay mutation with no fragments. No fetch of current key from server (assumes
fresh user or explicit update only).

## Notes

- Input type is `"password"` to hide the key from shoulder surfers; not
  cryptographically secure (localStorage stores the value in plaintext on the
  server).
- Strings are centralized in `MetadataTab.strings.ts` (LocalizedStrings).
- Success message has no timeout; it persists until the next save attempt
  (saved resets to false in `handleSave()`).
- Server validates the OMDb API key format asynchronously; validation errors
  are not surfaced in the UI (check Seq logs if key fails to work).
