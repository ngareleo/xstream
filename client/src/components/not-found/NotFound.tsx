import { type FC } from "react";
import { Link, useNavigate } from "react-router-dom";

import { IconArrowLeft, IconSearch } from "~/lib/icons.js";

import { strings } from "./NotFound.strings.js";
import { useNotFoundStyles } from "./NotFound.styles.js";

export const NotFound: FC = () => {
  const navigate = useNavigate();
  const styles = useNotFoundStyles();

  return (
    <div className={styles.root}>
      <div className={styles.bg} />
      <div className={styles.grain} />

      <div className={styles.body}>
        <div className={styles.code}>{strings.code}</div>
        <div className={styles.title}>{strings.title}</div>
        <div className={styles.sub}>{strings.subtitle}</div>

        <div className={styles.actions}>
          <button className={styles.btnGhost} onClick={() => void navigate(-1)} type="button">
            <IconArrowLeft size={14} />
            {strings.goBack}
          </button>
          <Link to="/" className={styles.btnRed}>
            <IconSearch size={14} />
            {strings.browseLibrary}
          </Link>
        </div>
      </div>
    </div>
  );
};
