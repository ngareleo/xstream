import { type FC } from "react";
import { useNavigate } from "react-router-dom";
import { mergeClasses } from "@griffel/react";
import { type Film } from "../../data/mock.js";
import { ImdbBadge, IconBack, IconClose, IconPlay } from "../../lib/icons.js";
import { Poster } from "../Poster/Poster.js";
import { useFilmDetailsOverlayStyles } from "./FilmDetailsOverlay.styles.js";

interface FilmDetailsOverlayProps {
  film: Film;
  onClose: () => void;
}

/**
 * Full-bleed film details surface used on the Library home when a tile
 * is clicked. Replaces the page contents while open. Play CTA uses
 * `document.startViewTransition` when available so the poster crossfades
 * smoothly into the player backdrop.
 */
export const FilmDetailsOverlay: FC<FilmDetailsOverlayProps> = ({
  film,
  onClose,
}) => {
  const s = useFilmDetailsOverlayStyles();
  const navigate = useNavigate();

  const playWithTransition = (): void => {
    const target = `/player/${film.id}`;
    if (typeof document.startViewTransition === "function") {
      document.startViewTransition(() => navigate(target));
    } else {
      navigate(target);
    }
  };

  return (
    <div className={s.overlay}>
      <Poster
        url={film.posterUrl}
        alt={film.title ?? film.filename}
        className={s.poster}
      />
      <div className={s.gradient} />
      <div className="grain-layer" />
      <button
        type="button"
        onClick={onClose}
        aria-label="Back to home"
        className={s.back}
      >
        <IconBack />
        <span>Back</span>
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close details"
        className={s.close}
      >
        <IconClose />
      </button>
      <div className={s.content}>
        <div className={s.chips}>
          <span className={mergeClasses("chip", "green")}>
            {film.resolution}
          </span>
          {film.hdr && film.hdr !== "—" && (
            <span className="chip">{film.hdr}</span>
          )}
          {film.codec && <span className="chip">{film.codec}</span>}
          {film.rating !== null && (
            <span className={s.rating}>
              <ImdbBadge />
              {film.rating}
            </span>
          )}
        </div>
        <div className={s.title}>{film.title ?? film.filename}</div>
        <div className={s.metaRow}>
          {[film.year, film.genre, film.duration]
            .filter((v): v is string | number => v !== null && v !== undefined)
            .join(" · ")}
        </div>
        {film.director && (
          <div className={s.director}>
            Directed by{" "}
            <span className={s.directorName}>{film.director}</span>
          </div>
        )}
        {film.plot && <div className={s.plot}>{film.plot}</div>}
        <div className={s.actions}>
          <button
            type="button"
            onClick={playWithTransition}
            className={s.playCta}
          >
            <IconPlay />
            <span>Play</span>
          </button>
          <span className={s.filename}>{film.filename}</span>
        </div>
      </div>
    </div>
  );
};
