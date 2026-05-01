import { type FC } from "react";
import { Link, useNavigate } from "react-router-dom";
import { mergeClasses } from "@griffel/react";
import { IconBack, IconSearch } from "../../lib/icons.js";
import { useNotFoundStyles } from "./NotFound.styles.js";

export const NotFound: FC = () => {
  const navigate = useNavigate();
  const styles = useNotFoundStyles();
  return (
    <div className={styles.shell}>
      <div className={mergeClasses("grain-layer", styles.grain)} />
      <div className={styles.glow} />
      <div aria-hidden className={styles.watermark}>
        404
      </div>

      <div className={styles.content}>
        <div className={mergeClasses("eyebrow", styles.eyebrowGreen)}>
          · NOT FOUND
        </div>
        <div className={styles.hero}>Nothing here.</div>
        <div className={styles.intro}>
          The page you tried to reach has moved or never existed. Head back to
          the library to keep browsing.
        </div>

        <div className={styles.actionRow}>
          <button onClick={() => navigate(-1)} className={styles.ghostBtn}>
            <IconBack /> Go back
          </button>
          <Link to="/" className={styles.primaryLink}>
            <IconSearch /> Browse library
          </Link>
        </div>
      </div>
    </div>
  );
};
