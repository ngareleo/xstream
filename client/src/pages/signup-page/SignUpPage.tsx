import { mergeClasses } from "@griffel/react";
import { type FC, useState } from "react";
import { Link } from "react-router-dom";

import { useAuthFormStyles } from "~/components/auth-form/AuthForm.styles.js";
import { useAuthLayoutStyles } from "~/components/auth-layout/AuthLayout.styles.js";

import { strings } from "./SignUpPage.strings.js";
import { useSignUpStyles } from "./SignUpPage.styles.js";

const SignUpPage: FC = () => {
  const layout = useAuthLayoutStyles();
  const form = useAuthFormStyles();
  const styles = useSignUpStyles();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showMismatch, setShowMismatch] = useState(false);

  const mismatch = showMismatch && confirm.length > 0 && password !== confirm;

  return (
    <>
      <div className={layout.eyebrow}>{strings.eyebrow}</div>
      <div className={layout.title}>{strings.title}</div>
      <div className={layout.subtitle}>{strings.subtitle}</div>

      <form
        className={form.form}
        onSubmit={(e) => {
          e.preventDefault();
          setShowMismatch(true);
        }}
      >
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

        <button type="submit" className={form.primaryBtn}>
          {strings.submit}
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
