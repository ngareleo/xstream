import { mergeClasses } from "@griffel/react";
import { type FC } from "react";

import { useLogo02Styles } from "./Logo02.styles.js";

export const Logo02: FC<{ size?: number; showWordmark?: boolean }> = ({
  size = 120,
  showWordmark = true,
}) => {
  const styles = useLogo02Styles();
  return (
    <div className={styles.wrap}>
      <svg
        aria-label="Xstream"
        width={size}
        height={size}
        viewBox="0 0 120 120"
        fill="none"
        className={mergeClasses(styles.mark, showWordmark && styles.markWithWordmark)}
      >
        <circle cx="60" cy="60" r="58" stroke="var(--green-deep)" strokeWidth="1" />
        <path
          d="M30 30 L90 90 M90 30 L30 90"
          stroke="var(--green)"
          strokeWidth="6"
          strokeLinecap="square"
        />
        <circle cx="60" cy="60" r="6" fill="var(--bg-0)" stroke="var(--green)" strokeWidth="1.5" />
      </svg>
      {showWordmark && <div className={styles.wordmark}>XSTREAM</div>}
    </div>
  );
};
