/**
 * GoodbyePage — shown after the user confirms sign-out.
 *
 * Full-screen atmospheric treatment (grain + radial glow). Auto-redirects to
 * "/" after 4 seconds; the user can also navigate back immediately.
 * Outside AppShell — no sidebar or header.
 */

import React, { type FC, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { LogoShield } from "~/lib/icons.js";

import { strings } from "./GoodbyePage.strings.js";
import { useGoodbyeStyles } from "./GoodbyePage.styles.js";

const GoodbyePage: FC = () => {
  const navigate = useNavigate();
  const styles = useGoodbyeStyles();

  useEffect(() => {
    const id = setTimeout(() => void navigate("/", { replace: true }), 4000);
    return () => clearTimeout(id);
  }, [navigate]);

  return (
    <div className={styles.root}>
      <div className={styles.grain} />
      <div className={styles.glow} />
      <div className={styles.ghost} aria-hidden="true">
        {strings.ghost}
      </div>

      <div className={styles.body}>
        <LogoShield />
        <div className={styles.title}>{strings.title}</div>
        <div className={styles.sub}>{strings.subtitle}</div>

        <div className={styles.actions}>
          <button
            className={styles.btnRed}
            onClick={() => void navigate("/", { replace: true })}
            type="button"
          >
            {strings.backToHome}
          </button>
          <span className={styles.countdown}>{strings.redirecting}</span>
        </div>
      </div>
    </div>
  );
};

export default GoodbyePage;
