import { type FC } from "react";
import { type Film } from "../../data/mock.js";
import { MediaKindBadge } from "../MediaKindBadge/MediaKindBadge.js";
import { Poster } from "../Poster/Poster.js";
import { useFilmTileStyles } from "./FilmTile.styles.js";

interface FilmTileProps {
  film: Film;
  progress?: number;
  onClick: () => void;
}

/**
 * Poster card used by Library carousels and search results. Click sends
 * the parent a notification — the page decides whether to open detail
 * or navigate to the player.
 *
 * A small kind badge in the top-left corner distinguishes movies from
 * TV series at a glance — see `<MediaKindBadge variant="tile">`.
 */
export const FilmTile: FC<FilmTileProps> = ({ film, progress, onClick }) => {
  const s = useFilmTileStyles();
  return (
    <button type="button" onClick={onClick} className={s.tile}>
      <div className={s.frame}>
        <Poster
          url={film.posterUrl}
          alt={film.title ?? film.filename}
          className={s.image}
        />
        <MediaKindBadge kind={film.kind} variant="tile" />
        {progress !== undefined && (
          <div className={s.progressTrack}>
            <div
              className={s.progressFill}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
      <div className={s.meta}>
        <div className={s.title}>{film.title ?? film.filename}</div>
        <div className={s.subtitle}>
          {[film.year, film.duration].filter(Boolean).join(" · ")}
        </div>
      </div>
    </button>
  );
};
