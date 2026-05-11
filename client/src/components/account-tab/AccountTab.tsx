import { type FC, type FormEvent, useEffect, useState } from "react";
import { commitLocalUpdate, useRelayEnvironment } from "react-relay";
import { useNavigate } from "react-router-dom";

import { useSettingsTabStyles } from "~/components/settings-tabs/SettingsTabs.styles.js";
import { changePassword, getSession, signOut } from "~/services/auth.js";
import { clearSessionContext } from "~/services/playbackSession.js";

import { strings } from "./AccountTab.strings.js";
import { useAccountTabStyles } from "./AccountTab.styles.js";

const MIN_PASSWORD_LENGTH = 8;

export const AccountTab: FC = () => {
  const tabStyles = useSettingsTabStyles();
  const styles = useAccountTabStyles();
  const environment = useRelayEnvironment();
  const navigate = useNavigate();

  const [email, setEmail] = useState<string | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmNext, setConfirmNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void getSession().then((session) => {
      setEmail(session?.user.email ?? null);
    });
  }, []);

  const onChangePassword = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSuccess(false);
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(strings.tooShort);
      return;
    }
    if (next !== confirmNext) {
      setError(strings.mismatch);
      return;
    }
    setSubmitting(true);
    const result = await changePassword(current, next);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSuccess(true);
    setCurrent("");
    setNext("");
    setConfirmNext("");
  };

  // Order is load-bearing — see docs/architecture/Identity/01-Sign-In-Flow.md §"Sign out".
  const onSignOut = async (): Promise<void> => {
    await signOut();
    clearSessionContext();
    commitLocalUpdate(environment, (store) => {
      store.invalidateStore();
    });
    navigate("/signin", { replace: true });
  };

  return (
    <div className={tabStyles.section}>
      <div className={tabStyles.sectionTitle}>{strings.emailTitle}</div>
      <div className={tabStyles.sectionDesc}>{strings.emailDesc}</div>
      <div className={styles.email}>{email ?? strings.signedOut}</div>

      <div className={styles.signOutZone}>
        <div className={tabStyles.sectionTitle}>{strings.changePasswordTitle}</div>
        <div className={tabStyles.sectionDesc}>{strings.changePasswordDesc}</div>
        <form className={styles.fieldStack} onSubmit={onChangePassword}>
          <div>
            <label className={tabStyles.label} htmlFor="account-current-password">
              {strings.currentPasswordLabel}
            </label>
            <input
              id="account-current-password"
              type="password"
              autoComplete="current-password"
              required
              className={tabStyles.input}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div>
            <label className={tabStyles.label} htmlFor="account-new-password">
              {strings.newPasswordLabel}
            </label>
            <input
              id="account-new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              className={tabStyles.input}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </div>
          <div>
            <label className={tabStyles.label} htmlFor="account-confirm-password">
              {strings.confirmPasswordLabel}
            </label>
            <input
              id="account-confirm-password"
              type="password"
              autoComplete="new-password"
              required
              className={tabStyles.input}
              value={confirmNext}
              onChange={(e) => setConfirmNext(e.target.value)}
            />
          </div>

          {error && <div className={styles.errorMsg}>{error}</div>}
          {success && <div className={tabStyles.successMsg}>{strings.success}</div>}

          <button type="submit" className={tabStyles.btn} disabled={submitting}>
            {submitting ? strings.submitting : strings.submit}
          </button>
        </form>
      </div>

      <div className={styles.signOutZone}>
        <div className={tabStyles.sectionTitle}>{strings.signOutTitle}</div>
        <div className={tabStyles.sectionDesc}>{strings.signOutDesc}</div>
        <button type="button" className={styles.signOutBtn} onClick={onSignOut}>
          {strings.signOutBtn}
        </button>
      </div>
    </div>
  );
};
