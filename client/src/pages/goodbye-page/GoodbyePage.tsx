import { mergeClasses } from "@griffel/react";
import { type FC, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Logo02 } from "~/components/logo/Logo02.js";

import { strings } from "./GoodbyePage.strings.js";
import { useGoodbyeStyles } from "./GoodbyePage.styles.js";

const REDIRECT_DELAY = 4;

const GoodbyePage: FC = () => {
  const navigate = useNavigate();
  const styles = useGoodbyeStyles();
  const [countdown, setCountdown] = useState(REDIRECT_DELAY);

  useEffect(() => {
    if (countdown <= 0) {
      void navigate("/", { replace: true });
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
        {strings.ghost}
      </div>

      <div className={styles.content}>
        <div className={styles.logoWrap}>
          <Logo02 size={64} showWordmark={false} />
        </div>
        <div className={mergeClasses("eyebrow", styles.eyebrow)}>{strings.eyebrow}</div>
        <div className={styles.title}>{strings.title}</div>
        <div className={styles.subtitle}>{strings.subtitle}</div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => void navigate("/", { replace: true })}
          >
            {strings.backToHome}
          </button>
          <span className={styles.countdown}>
            {strings.formatString(strings.redirectingFormat, { n: countdown })}
          </span>
        </div>
      </div>
    </div>
  );
};

export default GoodbyePage;
