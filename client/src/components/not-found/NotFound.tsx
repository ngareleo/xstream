import { mergeClasses } from "@griffel/react";
import { type FC } from "react";
import { Link, useNavigate } from "react-router-dom";

import { IconBack, IconSearch } from "~/lib/icons.js";

import { strings } from "./NotFound.strings.js";
import { useNotFoundStyles } from "./NotFound.styles.js";

export const NotFound: FC = () => {
  const navigate = useNavigate();
  const styles = useNotFoundStyles();

  return (
    <div className={styles.shell}>
      <div className={mergeClasses("grain-layer", styles.grain)} />
      <div className={styles.glow} />
      <div aria-hidden className={styles.watermark}>
        {strings.code}
      </div>

      <div className={styles.content}>
        <div className={mergeClasses("eyebrow", styles.eyebrow)}>{strings.eyebrow}</div>
        <div className={styles.title}>{strings.title}</div>
        <div className={styles.subtitle}>{strings.subtitle}</div>

        <div className={styles.actions}>
          <button type="button" className={styles.ghostBtn} onClick={() => void navigate(-1)}>
            <IconBack size={14} /> {strings.goBack}
          </button>
          <Link to="/" className={styles.primaryLink}>
            <IconSearch size={14} /> {strings.browseLibrary}
          </Link>
        </div>
      </div>
    </div>
  );
};
