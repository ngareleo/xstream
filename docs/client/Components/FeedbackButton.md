# FeedbackButton

Icon button trigger that owns the `FeedbackDialog` open state. Displays a chat icon and controls the modal lifecycle.

## Role

A simple icon button (chat / speech-bubble icon) that opens the feedback dialog when clicked. It maintains the `open` state and passes it to `FeedbackDialog` via the `open` and `onOpenChange` props.

## Props

```ts
interface FeedbackButtonProps {
  // None — this component is completely self-contained
}
```

## Layout & styles

- Icon button: square, padding-box styled via Griffel
- Icon: `@heroicons/react/IconChat` (or equivalent speech-bubble icon)
- Hover state: subtle background or opacity change
- No tooltip (kept minimal)

The button integrates into the parent toolbar (AppHeader's button row or ControlBar's button row) and is sized/aligned to match sibling buttons.

## Behaviour

### State management

FeedbackButton owns the `open` state for the `FeedbackDialog`:

```ts
const [open, setOpen] = useState(false);

return (
  <>
    <button onClick={() => setOpen(true)}>
      <ChatIcon />
    </button>
    <FeedbackDialog open={open} onOpenChange={setOpen} />
  </>
);
```

Clicking the button sets `open = true`, which mounts the dialog. The dialog's onOpenChange callback updates `open` when the user submits or cancels.

## Data sources

None. No Relay, no GraphQL, no async.

## Used by

- `AppHeader` — global feedback button in the header
- `ControlBar` — in-player feedback button for immediate feedback during playback

## Observability

No direct observability on the button itself. Feedback submission is logged by `FeedbackDialog.`

## Outstanding work

- Keyboard shortcut (e.g. Ctrl+? or Cmd+?) to open
