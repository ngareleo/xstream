import { mergeClasses } from "@griffel/react";
import { type FC, type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuthFormStyles } from "~/components/auth-form/AuthForm.styles.js";
import { useAuthLayoutStyles } from "~/components/auth-layout/AuthLayout.styles.js";
import { signUp } from "~/services/auth.js";

import { strings } from "./SignUpPage.strings.js";
import { useSignUpStyles } from "./SignUpPage.styles.js";

const SignUpPage: FC = () => {
  const layout = useAuthLayoutStyles();
  const form = useAuthFormStyles();
  const styles = useSignUpStyles();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showMismatch, setShowMismatch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const mismatch = showMismatch && confirm.length > 0 && password !== confirm;

  const onSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setShowMismatch(true);
    if (password !== confirm) return;
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await signUp(email, password);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    // Null session = email confirmation is on; user must verify before signin.
    if (result.session) {
      navigate("/", { replace: true });
    } else {
      navigate("/signin", { replace: true });
    }
  };

  return (
    <>
      <div className={layout.eyebrow}>{strings.eyebrow}</div>
      <div className={layout.title}>{strings.title}</div>
      <div className={layout.subtitle}>{strings.subtitle}</div>

      <form className={form.form} onSubmit={onSubmit}>
        <div className={form.field}>
          <label className={form.label} htmlFor="signup-email">
            {strings.emailLabel}
          </label>
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            required
            className={form.input}
            placeholder={strings.emailPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className={form.field}>
          <label className={form.label} htmlFor="signup-password">
            {strings.passwordLabel}
          </label>
          <input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className={form.input}
            placeholder={strings.passwordPlaceholder}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className={form.field}>
          <label className={form.label} htmlFor="signup-confirm">
            {strings.confirmLabel}
          </label>
          <input
            id="signup-confirm"
            type="password"
            autoComplete="new-password"
            required
            className={mergeClasses(form.input, mismatch && form.inputError)}
            placeholder={strings.confirmPlaceholder}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={mismatch}
          />
          {mismatch ? <span className={form.fieldError}>{strings.confirmMismatch}</span> : null}
        </div>

        {error && <div className={form.fieldError}>{error}</div>}

        <button type="submit" className={form.primaryBtn} disabled={submitting}>
          {submitting ? strings.submitting : strings.submit}
        </button>

        <div className={form.helpRow}>
          <span className={styles.helperText}>
            {strings.haveAccountPrefix}{" "}
            <Link to="/signin" className={form.inlineLink}>
              {strings.haveAccountLink}
            </Link>
          </span>
        </div>
      </form>
    </>
  );
};

export default SignUpPage;
