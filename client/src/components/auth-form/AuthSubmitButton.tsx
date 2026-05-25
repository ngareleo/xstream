import { mergeClasses } from "@griffel/react";
import { type FC } from "react";

import { useAuthFormStyles } from "./AuthForm.styles.js";

interface AuthSubmitButtonProps {
  submitting: boolean;
  /** Label shown at rest (e.g. "Sign in"). */
  idleLabel: string;
  /** Label shown while the request is in flight (e.g. "Signing in…"). */
  busyLabel: string;
}

/**
 * Primary submit button for the auth forms. At rest it's the plain green
 * CTA; while `submitting`, an indeterminate sweep crosses the surface and
 * the label is joined by three rippling dots.
 */
export const AuthSubmitButton: FC<AuthSubmitButtonProps> = ({
  submitting,
  idleLabel,
  busyLabel,
}) => {
  const form = useAuthFormStyles();
  return (
    <button
      type="submit"
      className={mergeClasses(form.primaryBtn, submitting && form.primaryBtnBusy)}
      disabled={submitting}
      aria-busy={submitting}
    >
      {submitting ? busyLabel : idleLabel}
      {submitting && (
        <span className={form.busyDots} aria-hidden="true">
          <span className={form.busyDot} />
          <span className={mergeClasses(form.busyDot, form.busyDot2)} />
          <span className={mergeClasses(form.busyDot, form.busyDot3)} />
        </span>
      )}
    </button>
  );
};
