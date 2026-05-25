# FeedbackDialog

User feedback submission dialog — a modal containing a 1–5 star rating, optional free-text message, and submit/cancel buttons.

## Role

`FeedbackDialog` is a modal overlay controlled by `FeedbackButton` (which owns the open state). It emits a `feedback.submitted` log when the user clicks Submit, carrying the rating, optional text, and the current route. No backend persistence or GraphQL mutation — feedback is for post-session review via the OTel logs backend.

## Props

```ts
interface FeedbackDialogProps {
  // Modal state
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

## Layout & styles

The dialog is a centered modal (Griffel-styled glass panel, semi-transparent scrim). Layout:

- Glass panel container: max-width 400px, padding 24px
- Star rating: 5 inline stars (hover to highlight, click to select). Selected state is filled; unselected outline.
- Free-text input: `<textarea>`, placeholder "Your thoughts (optional)", max 500 characters, rows 4
- Character count: displayed below textarea, updates live (e.g. "120 / 500")
- Button row: Cancel (secondary) + Submit (primary, disabled until rating is selected)

Griffel classes generated from `.styles.ts`. No runtime `style=` props. Scrim uses `rgba(0, 0, 0, 0.5)` with `backdrop-filter: blur(8px)`.

## Behaviour

### Interaction flow

1. User clicks to open (via `FeedbackButton` setting `open = true`)
2. User selects a rating by clicking a star (1–5); selection is immediate and highlighted
3. User optionally types into the textarea; character count updates live
4. User clicks Submit (enabled once rating is selected) or Cancel (closes without submitting)
5. On Submit: emit log + close the dialog; reset internal state (rating, text) for the next open

### Star rating

Stars are simple `<button>` elements styled as icons. Click a star to set the rating; hovering shows the "hover-to-this-value" state. No keyboard shortcut (arrow keys could be added in a future UX pass).

### Submit

Submit is enabled iff a rating (1–5) is selected. Clicking Submit:
- Emits a `feedback.submitted` log with attributes `feedback.rating` (1–5), `feedback.text` (empty string if not entered), `route` (current location pathname)
- Closes the dialog (sets `open = false`)
- Clears the form (resets rating to null, text to "")

On Submit, do NOT show a toast or "thanks" message — the dialog closes immediately for a clean UX. If we want a "thanks" affordance, that's a future design decision (e.g. a brief toast elsewhere).

### Cancel

Cancel closes the dialog without emitting a log. Internal state (rating, text) is cleared so the form is fresh on the next open.

### Character limit

Textarea allows max 500 characters. The character-count display updates on every keystroke. If the user pastes >500 characters, the browser's `maxlength` attribute prevents insertion (or the latest keystroke that would exceed the limit is ignored, depending on browser). Display the count always, not just when hovering.

## Data sources

None. This component is purely UI — it has no Relay fragment, no GraphQL query, no async data dependencies. It reads the current route via `useLocation()` to populate the `route` attribute on the log.

## Used by

- `FeedbackButton` — owns the open state and triggers the dialog
- `AppHeader` — global feedback via FeedbackButton
- `ControlBar` — in-player feedback via FeedbackButton

## Observability

- Log: `feedback.submitted` — emitted on Submit with `feedback.rating`, `feedback.text`, `route`
- No spans, no events beyond the log

## Outstanding work

- Keyboard navigation (arrow keys to select star, Escape to close)
- Toast / success affordance if product feedback suggests one
- Rate limiting (don't spam the same feedback within N seconds)
