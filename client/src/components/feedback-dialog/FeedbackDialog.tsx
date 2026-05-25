import { mergeClasses } from "@griffel/react";
import { type FC, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { getClientLogger } from "~/telemetry.js";
import { routeTemplate } from "~/utils/routeTemplate.js";

import { strings } from "./FeedbackDialog.strings.js";
import { useFeedbackDialogStyles } from "./FeedbackDialog.styles.js";

const log = getClientLogger("feedback");
const STARS = [1, 2, 3, 4, 5] as const;

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Modal feedback form (1–5 star rating + optional message). On submit it emits a
 * `feedback.submitted` telemetry event tagged with the current route, rating,
 * and message — no GraphQL/DB; feedback is reviewed in the telemetry backend.
 * The Nova eventing sink is a no-op today, so this logs directly.
 *
 * Controlled by the caller (`open`/`onClose`); rendered both from the AppHeader
 * (global) and the player ControlBar (so the player has feedback too).
 */
export const FeedbackDialog: FC<Props> = ({ open, onClose }) => {
  const styles = useFeedbackDialogStyles();
  const { pathname } = useLocation();
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Reset to a clean form whenever the dialog (re)opens.
  useEffect(() => {
    if (open) {
      setRating(0);
      setMessage("");
      setSubmitted(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const canSubmit = rating > 0 || message.trim().length > 0;

  const handleSubmit = (): void => {
    if (!canSubmit) return;
    log.info("Feedback submitted", {
      route: routeTemplate(pathname),
      "feedback.rating": rating,
      "feedback.text": message.trim(),
    });
    setSubmitted(true);
    // Brief acknowledgement, then close.
    window.setTimeout(onClose, 1200);
  };

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      role="presentation"
      data-testid="feedback-overlay"
    >
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={strings.a11yLabel}
        onClick={(e) => e.stopPropagation()}
      >
        {submitted ? (
          <p className={styles.thanks}>{strings.thanks}</p>
        ) : (
          <>
            <h2 className={styles.title}>{strings.title}</h2>
            <p className={styles.subtitle}>{strings.subtitle}</p>

            <div className={styles.stars} role="radiogroup" aria-label={strings.ratingLabel}>
              {STARS.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={rating === value}
                  aria-label={strings.formatString(strings.starLabel, value) as string}
                  className={mergeClasses(styles.star, value <= rating && styles.starFilled)}
                  onClick={() => setRating(value)}
                >
                  {value <= rating ? "★" : "☆"}
                </button>
              ))}
            </div>

            <textarea
              className={styles.message}
              placeholder={strings.messagePlaceholder}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />

            <div className={styles.actions}>
              <button type="button" className={styles.cancelBtn} onClick={onClose}>
                {strings.cancel}
              </button>
              <button
                type="button"
                className={styles.submitBtn}
                disabled={!canSubmit}
                onClick={handleSubmit}
              >
                {strings.submit}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
