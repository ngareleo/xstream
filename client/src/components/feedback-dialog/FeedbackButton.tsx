import { type FC, useState } from "react";

import { IconChat } from "~/lib/icons.js";

import { FeedbackDialog } from "./FeedbackDialog.js";
import { strings } from "./FeedbackDialog.strings.js";

interface Props {
  /** Class for the trigger button — host supplies it so the icon matches its toolbar. */
  className?: string;
  iconSize?: number;
}

/** Chat-icon button that opens the {@link FeedbackDialog}; owns its open state. */
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
