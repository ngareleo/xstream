import { type FC, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { mergeClasses } from "@griffel/react";
import { user } from "../../data/mock.js";
import { Logo02 } from "../../components/Logo/Logo02.js";
import { useGoodbyeStyles } from "./Goodbye.styles.js";

const REDIRECT_DELAY = 4;

export const Goodbye: FC = () => {
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(REDIRECT_DELAY);
  const styles = useGoodbyeStyles();

  useEffect(() => {
    if (countdown <= 0) {
      navigate("/", { replace: true });
      return;
    }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown, navigate]);

  return (
    <div className={styles.shell}>
      <div className={mergeClasses("grain-layer", styles.grain)} />
      <div className={styles.glow} />
      <div aria-hidden className={styles.watermark}>
        GOODBYE
      </div>

      <div className={styles.content}>
        <div className={styles.logoWrap}>
          <Logo02 size={64} showWordmark={false} />
        </div>
        <div className={mergeClasses("eyebrow", styles.eyebrowGreen)}>
          · SESSION ENDED
        </div>
        <div className={styles.hero}>
          See you next time, {user.name}.
        </div>
        <div className={styles.intro}>
          Your library will be right here when you get back.
        </div>

        <div className={styles.actionRow}>
          <button
            onClick={() => navigate("/", { replace: true })}
            className={styles.primaryBtn}
          >
            Back to home
          </button>
          <span className={styles.countdown}>
            Redirecting in {countdown}s…
          </span>
        </div>
      </div>
    </div>
  );
};
