import { type FC } from "react";
import { Link } from "react-router-dom";
import { ImdbBadge, IconClose } from "../../lib/icons.js";
import { type Film } from "../../data/mock.js";
import { Poster } from "../Poster/Poster.js";
import { useDetailPaneStyles } from "./DetailPane.styles.js";

interface DetailPaneProps {
  film: Film;
  onClose: () => void;
}

/**
 * Right-rail film detail. Identical structure on Profiles and Library.
 * Visual treatment ported from `app-mockups.jsx` DetailPane.
 */
export const DetailPane: FC<DetailPaneProps> = ({ film, onClose }) => {
  const styles = useDetailPaneStyles();
  const hdrLabel = film.hdr && film.hdr !== "—" ? film.hdr.toUpperCase() : null;
  return (
    <div className={styles.pane}>
      <div className={styles.posterFrame}>
        <Poster
          url={film.posterUrl}
          alt={film.title ?? film.filename}
          className={styles.posterImage}
        />
        <div className={styles.posterFade} />
        <button
          onClick={onClose}
          aria-label="Close detail pane"
          className={styles.closeBtn}
        >
          <IconClose />
        </button>
      </div>

      <div className={styles.body}>
        <div className={styles.actionRow}>
          <Link to={`/player/${film.id}`} className={styles.playBtn}>
            ▶ Play in {film.resolution}
          </Link>
          <button className={styles.reLinkBtn}>RE-LINK</button>
        </div>

        <div className={styles.title}>{film.title ?? "Unmatched file"}</div>
        <div className={styles.subhead}>
          {[film.year, film.genre, film.duration].filter(Boolean).join(" · ")}
        </div>

        <div className={styles.techChips}>
          <span className="chip green">{film.resolution} UHD</span>
          {hdrLabel && <span className="chip">{hdrLabel}</span>}
          <span className="chip">{film.codec}</span>
          <span className="chip">
            {film.audio} {film.audioChannels}
          </span>
        </div>

        <div className={styles.ratingRow}>
          {film.rating !== null && (
            <>
              <ImdbBadge />
              <span className={styles.ratingValue}>{film.rating}</span>
              <span className={styles.divider}>·</span>
            </>
          )}
          <span>{film.duration}</span>
          <span className={styles.divider}>·</span>
          <span className={styles.status}>● ON DISK</span>
        </div>

        {film.plot && <div className={styles.plot}>{film.plot}</div>}

        {film.cast.length > 0 && (
          <>
            <div className={styles.sectionLabel}>CAST</div>
            <div className={styles.castChips}>
              {film.cast.map((c) => (
                <span key={c} className="chip">
                  {c}
                </span>
              ))}
            </div>
          </>
        )}

        <div className={styles.sectionLabel}>FILE</div>
        <div className={styles.fileBlock}>
          <div>{film.filename}</div>
          <div className={styles.fileMeta}>
            <span>{film.size}</span>
            <span>·</span>
            <span>{film.bitrate}</span>
            <span>·</span>
            <span>{film.frameRate}</span>
            <span>·</span>
            <span>{film.container}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
