/**
 * Goodbye page — shown after the user confirms sign-out.
 *
 * Full-screen atmospheric treatment (same language as the Player idle overlay
 * and the 404 page). Auto-redirects to "/" after 4 seconds; the user can also
 * click "Back to home" immediately.
 *
 * This is outside AppShell so there is no sidebar or header.
 */

import { mergeClasses } from "@griffel/react";
import { type FC, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { user } from "../../data/mock.js";
import { LogoShield } from "../../lib/icons.js";
import { useGoodbyeStyles } from "./Goodbye.styles.js";

const REDIRECT_DELAY = 4; // seconds

export const Goodbye: FC = () => {
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(REDIRECT_DELAY);
  const s = useGoodbyeStyles();

  useEffect(() => {
    if (countdown <= 0) {
      navigate("/", { replace: true });
      return;
    }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown, navigate]);

  return (
    <div className={s.root}>
      <div className={s.grain} />
      <div className={s.glow} />

      <div className={s.body}>
        <div className={s.ghost}>GOODBYE</div>

        <div style={{ width: 44, height: 52, opacity: 0.5, marginBottom: 4 }}>
          <LogoShield />
        </div>

        <div className={s.title}>See you next time, {user.name}.</div>
        <div className={s.sub}>
          Your library will be right here when you get back.
        </div>

        <div className={s.actions}>
          <button
            className={mergeClasses(s.btnRed, s.btnMd)}
            onClick={() => navigate("/", { replace: true })}
          >
            Back to home
          </button>
          <span className={s.countdown}>
            Redirecting in {countdown}s…
          </span>
        </div>
      </div>
    </div>
  );
};
