# LibraryTab

Library management section in Settings. Triggers an immediate rescan of all
configured library directories to pick up new files or remove missing ones.
Single-action tab with loading and success states.

**Source:** `client/src/components/library-tab/`
**Used by:** SettingsPage right-pane, conditional render when `section=library`.

## Role

Settings tab that initiates a full library scan operation. Calls the
`scanLibraries` GraphQL mutation and surfaces mutation pending/complete states
to the user.

## Queries & mutations

### Mutation: `LibraryTabScanMutation`

```graphql
mutation LibraryTabScanMutation {
  scanLibraries {
    id
  }
}
```

- **Trigger**: User clicks "Scan Libraries" button.
- **Variables**: None.
- **Response**: `id` (not used; mutation primarily has side effects on the
  server).
- **Pending state**: Button text changes to "Scanning…" and disables while the
  mutation is in flight.
- **Complete state**: On success, displays "Scan triggered successfully." below
  the button.

## Layout & styles

- Uses `useSettingsTabStyles()` from `SettingsTabs.styles.ts`.
- **Section wrapper** — `className={styles.section}`.
- **Title** — `sectionTitle` class: "Library Scan", 13px, bold.
- **Description** — `sectionDesc` class: Multi-line explanation of library scan
  behaviour.
- **Button** — `styles.btn`: Green button, disabled while `isPending`.
  - Text: "Scan Libraries" (idle) or "Scanning…" (pending).
  - `onClick`: Calls `handleScan()`, which resets done flag and triggers mutation.
- **Success message** — `styles.successMsg`: Rendered conditionally when `done`
  is true. Text: "Scan triggered successfully."

## Behaviour

- Component owns local state: `done` (boolean flag for success message display).
- Mutation state: `isPending` (true while mutation is in flight).
- Click flow:
  1. User clicks button.
  2. `handleScan()` resets `done` to false, calls `scan({ variables: {}, ... })`.
  3. Button disables and text changes to "Scanning…" (`isPending` === true).
  4. Mutation completes.
  5. `onCompleted` callback fires, `setDone(true)`.
  6. Success message appears; button re-enables.
- No confirmation or undo — scan is idempotent on the server.

## Data

Relay mutation with no fragments. The component doesn't fetch library state;
it only triggers the server-side scan operation.

## Notes

- Strings are centralized in `LibraryTab.strings.ts` (LocalizedStrings for
  future i18n).
- Success message auto-display has no timeout; it persists until the next
  scan is initiated (done resets to false).
- The mutation response is minimal (just `id`); the server logs changes.
  Observability via Seq traces linked from Logging Policy.
