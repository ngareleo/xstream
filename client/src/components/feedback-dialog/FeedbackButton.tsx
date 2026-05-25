import { type FC, useState } from "react";

import { IconChat } from "~/lib/icons.js";

import { FeedbackDialog } from "./FeedbackDialog.js";
import { strings } from "./FeedbackDialog.strings.js";

interface Props {
  /** Class for the trigger button — host supplies it so the icon matches its toolbar. */
  className?: string;
  iconSize?: number;
}

/**
 * Feedback trigger: a chat-icon button that opens the {@link FeedbackDialog}.
 * Owns the open/close state so call sites (AppHeader, player ControlBar) need
 * only drop it in with their own button styling.
 */
export const FeedbackButton: FC<Props> = ({ className, iconSize = 20 }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={strings.triggerLabel}
        onClick={() => setOpen(true)}
      >
        <IconChat size={iconSize} />
      </button>
      <FeedbackDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
};
