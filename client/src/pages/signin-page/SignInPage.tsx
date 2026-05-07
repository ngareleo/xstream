import { type FC, useState } from "react";
import { Link } from "react-router-dom";

import { useAuthFormStyles } from "~/components/auth-form/AuthForm.styles.js";
import { useAuthLayoutStyles } from "~/components/auth-layout/AuthLayout.styles.js";

import { strings } from "./SignInPage.strings.js";
import { useSignInStyles } from "./SignInPage.styles.js";

const SignInPage: FC = () => {
  const layout = useAuthLayoutStyles();
  const form = useAuthFormStyles();
  const styles = useSignInStyles();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <>
      <div className={layout.eyebrow}>{strings.eyebrow}</div>
      <div className={layout.title}>{strings.title}</div>
      <div className={layout.subtitle}>{strings.subtitle}</div>

      <form
        className={form.form}
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
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

        <button type="submit" className={form.primaryBtn}>
          {strings.submit}
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
