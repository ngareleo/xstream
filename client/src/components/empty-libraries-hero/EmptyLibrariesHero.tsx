import { type FC } from "react";
import { Link, useLocation } from "react-router-dom";

import { strings } from "./EmptyLibrariesHero.strings.js";
import { useEmptyLibrariesHeroStyles } from "./EmptyLibrariesHero.styles.js";

interface EmptyLibrariesHeroProps {
  /**
   * The faint Anton watermark in the bottom-right. Pages set this to
   * their own surface name ("library", "profiles", …) so the hero
   * still reads as the empty state for *that* page even though the
   * shared component is the same.
   */
  watermark: string;
}

export const EmptyLibrariesHero: FC<EmptyLibrariesHeroProps> = ({ watermark }) => {
  const styles = useEmptyLibrariesHeroStyles();
  const location = useLocation();
  // Encode URL as return_to=; survives HMR/refresh and visible in address bar.
  const returnTo = encodeURIComponent(location.pathname + location.search);
  const createHref = `/profiles/new?return_to=${returnTo}`;

  return (
    <div className={styles.root}>
      <div className={styles.watermark}>{watermark}</div>
      <div className={styles.content}>
        <div className={styles.eyebrow}>{strings.eyebrow}</div>
        <div className={styles.headline}>
          <span className={styles.headlineWhite}>{strings.headlineWhite}</span>
          <span className={styles.headlineAccent}>{strings.headlineAccent}</span>
        </div>
        <div className={styles.rule} />
        <p className={styles.body}>{strings.body}</p>
        <div className={styles.actions}>
          <Link to={createHref} className={styles.cta}>
            {strings.cta}
          </Link>
          <span className={styles.hint}>{strings.hint}</span>
        </div>
      </div>
    </div>
  );
};
