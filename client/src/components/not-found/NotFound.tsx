import { type FC } from "react";
import { Link, useNavigate } from "react-router-dom";

import { IconArrowLeft, IconSearch } from "~/lib/icons.js";

import { useNotFoundStyles } from "./NotFound.styles.js";

export const NotFound: FC = () => {
  const navigate = useNavigate();
  const styles = useNotFoundStyles();

  return (
    <div className={styles.root}>
      <div className={styles.bg} />
      <div className={styles.grain} />

      <div className={styles.body}>
        <div className={styles.code}>404</div>
        <div className={styles.title}>Page not found</div>
        <div className={styles.sub}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </div>

        <div className={styles.actions}>
          <button className={styles.btnGhost} onClick={() => void navigate(-1)} type="button">
            <IconArrowLeft size={14} />
            Go back
          </button>
          <Link to="/" className={styles.btnRed}>
            <IconSearch size={14} />
            Browse library
          </Link>
        </div>
      </div>
    </div>
  );
};
