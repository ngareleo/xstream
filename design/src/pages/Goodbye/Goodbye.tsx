/**
 * Goodbye page — shown after the user confirms sign-out.
 *
 * Full-screen atmospheric treatment (same language as the Player idle overlay
 * and the 404 page). Auto-redirects to "/" after 4 seconds; the user can also
 * click "Back to home" immediately.
 *
 * This is outside AppShell so there is no sidebar or header.
 */

import { type FC, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { user } from "../../data/mock.js";
import { LogoShield } from "../../lib/icons.js";
import "./Goodbye.css";

const REDIRECT_DELAY = 4; // seconds

export const Goodbye: FC = () => {
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(REDIRECT_DELAY);

  useEffect(() => {
    if (countdown <= 0) {
      navigate("/", { replace: true });
      return;
    }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown, navigate]);

  return (
    <div className="goodbye-root">
      <div className="goodbye-grain" />
      <div className="goodbye-glow" />

      <div className="goodbye-body">
        <div className="goodbye-ghost">GOODBYE</div>

        <LogoShield />

        <div className="goodbye-title">See you next time, {user.name}.</div>
        <div className="goodbye-sub">
          Your library will be right here when you get back.
        </div>

        <div className="goodbye-actions">
          <button
            className="btn btn-red btn-md"
            onClick={() => navigate("/", { replace: true })}
          >
            Back to home
          </button>
          <span className="goodbye-countdown">
            Redirecting in {countdown}s…
          </span>
        </div>
      </div>
    </div>
  );
};
