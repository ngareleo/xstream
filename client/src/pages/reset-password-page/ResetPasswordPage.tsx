import { type FC, type FormEvent, useState } from "react";
import { Link } from "react-router-dom";

import { useAuthFormStyles } from "~/components/auth-form/AuthForm.styles.js";
import { useAuthLayoutStyles } from "~/components/auth-layout/AuthLayout.styles.js";
import { resetPassword } from "~/services/auth.js";

import { strings } from "./ResetPasswordPage.strings.js";
import { useResetPasswordStyles } from "./ResetPasswordPage.styles.js";

const ResetPasswordPage: FC = () => {
  const layout = useAuthLayoutStyles();
  const form = useAuthFormStyles();
  const styles = useResetPasswordStyles();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await resetPassword(email);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <>
        <div className={layout.eyebrow}>{strings.sentEyebrow}</div>
        <div className={layout.title}>{strings.sentTitle}</div>
        <div className={layout.subtitle}>
          {strings.formatString(strings.sentSubtitleFormat, { email }) as string}
        </div>

        <div className={styles.sentActions}>
          <Link to="/signin" className={form.primaryBtn} role="button">
            {strings.sentDone}
          </Link>
          <button
            type="button"
            className={styles.resendBtn}
            onClick={() => {
              setSent(false);
              setEmail("");
            }}
          >
            {strings.sentResend}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className={layout.eyebrow}>{strings.eyebrow}</div>
      <div className={layout.title}>{strings.title}</div>
      <div className={layout.subtitle}>{strings.subtitle}</div>

      <form className={form.form} onSubmit={onSubmit}>
        <div className={form.field}>
          <label className={form.label} htmlFor="reset-email">
            {strings.emailLabel}
          </label>
          <input
            id="reset-email"
            type="email"
            autoComplete="email"
            required
            className={form.input}
            placeholder={strings.emailPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {error && <div className={form.fieldError}>{error}</div>}

        <button type="submit" className={form.primaryBtn} disabled={submitting}>
          {submitting ? strings.submitting : strings.submit}
        </button>

        <div className={styles.backRow}>
          <Link to="/signin" className={form.textLink}>
            {strings.back}
          </Link>
        </div>
      </form>
    </>
  );
};

export default ResetPasswordPage;
