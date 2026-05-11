import { type FC, type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuthFormStyles } from "~/components/auth-form/AuthForm.styles.js";
import { useAuthLayoutStyles } from "~/components/auth-layout/AuthLayout.styles.js";
import { signIn } from "~/services/auth.js";

import { strings } from "./SignInPage.strings.js";
import { useSignInStyles } from "./SignInPage.styles.js";

const SignInPage: FC = () => {
  const layout = useAuthLayoutStyles();
  const form = useAuthFormStyles();
  const styles = useSignInStyles();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await signIn(email, password);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    // The Relay environment reads the JWT per-request, so the first
    // post-signin query already carries the new token. Replace history
    // so the back button doesn't return to /signin.
    navigate("/", { replace: true });
  };

  return (
    <>
      <div className={layout.eyebrow}>{strings.eyebrow}</div>
      <div className={layout.title}>{strings.title}</div>
      <div className={layout.subtitle}>{strings.subtitle}</div>

      <form className={form.form} onSubmit={onSubmit}>
        <div className={form.field}>
          <label className={form.label} htmlFor="signin-email">
            {strings.emailLabel}
          </label>
          <input
            id="signin-email"
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
          <label className={form.label} htmlFor="signin-password">
            {strings.passwordLabel}
          </label>
          <input
            id="signin-password"
            type="password"
            autoComplete="current-password"
            required
            className={form.input}
            placeholder={strings.passwordPlaceholder}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className={styles.forgotRow}>
          <Link to="/reset-password" className={form.textLink}>
            {strings.forgot}
          </Link>
        </div>

        {error && <div className={form.fieldError}>{error}</div>}

        <button type="submit" className={form.primaryBtn} disabled={submitting}>
          {submitting ? strings.submitting : strings.submit}
        </button>

        <div className={form.helpRow}>
          <span className={styles.helperText}>
            {strings.newHerePrefix}{" "}
            <Link to="/signup" className={form.inlineLink}>
              {strings.newHereLink}
            </Link>
          </span>
        </div>
      </form>
    </>
  );
};

export default SignInPage;
