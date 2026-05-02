import { type FC, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { mergeClasses } from "@griffel/react";
import { type Film, getEpisodeStats, getResumeEpisode } from "../../data/mock.js";
import {
  IconClose,
  IconFolder,
  IconPlay,
  ImdbBadge,
} from "../../lib/icons.js";
import { FilmTile } from "../FilmTile/FilmTile.js";
import { Poster } from "../Poster/Poster.js";
import { PosterRow } from "../PosterRow/PosterRow.js";
import { SeasonsPanel } from "../SeasonsPanel/SeasonsPanel.js";
import { useFilmDetailsOverlayStyles } from "./FilmDetailsOverlay.styles.js";

interface FilmDetailsOverlayProps {
  film: Film;
  /** Films to surface in the "You might also like" row below the hero. */
  suggestions?: Film[];
  onClose: () => void;
  /** Click handler for a suggestion tile. Defaults to navigating to player. */
  onSelectSuggestion?: (id: string) => void;
}

/**
 * Full-bleed film details surface used on the Library home when a tile
 * is clicked. Replaces the page contents while open. Play CTA uses
 * `document.startViewTransition` when available so the poster crossfades
 * smoothly into the player backdrop.
 */
export const FilmDetailsOverlay: FC<FilmDetailsOverlayProps> = ({
  film,
  suggestions = [],
  onClose,
  onSelectSuggestion,
}) => {
  const s = useFilmDetailsOverlayStyles();
  const navigate = useNavigate();
  const overlayRef = useRef<HTMLDivElement>(null);
  const isSeries = film.kind === "series";
  const episodeStats = isSeries ? getEpisodeStats(film) : null;
  const resume = getResumeEpisode(film);
  const playLabel = resume ? "Continue" : "Play";

  const playWithTransition = (): void => {
    const target = resume
      ? `/player/${film.id}?s=${resume.season}&e=${resume.episode}`
      : `/player/${film.id}`;
    if (typeof document.startViewTransition === "function") {
      document.startViewTransition(() => navigate(target));
    } else {
      navigate(target);
    }
  };

  const playEpisode = (seasonNumber: number, episodeNumber: number): void => {
    navigate(`/player/${film.id}?s=${seasonNumber}&e=${episodeNumber}`);
  };

  const handleSuggestionClick = (id: string): void => {
    // Snap the scroll position back to the hero before the new film
    // mounts. Without this the user would land on the new film already
    // scrolled to the (re-rendered) suggestions row, which reads as
    // broken navigation. Smooth-scroll feels like the browser is taking
    // them back to the top intentionally.
    overlayRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    if (onSelectSuggestion) onSelectSuggestion(id);
    else navigate(`/player/${id}`);
  };

  const openInProfiles = (): void => {
    navigate(`/profiles?film=${encodeURIComponent(film.id)}`);
  };

  return (
    <div ref={overlayRef} className={s.overlay}>
      <div className={s.hero}>
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
          aria-label="Close details"
          className={s.close}
        >
          <IconClose />
        </button>
        <div className={mergeClasses(s.content, isSeries && s.contentWithRail)}>
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
              <span>{playLabel}</span>
            </button>
            <button
              type="button"
              onClick={openInProfiles}
              aria-label="Open in profiles"
              className={s.secondaryCta}
            >
              <IconFolder />
              <span>Open in profiles</span>
            </button>
            <span className={s.filename}>{film.filename}</span>
          </div>
          {suggestions.length > 0 && (
            <div className={s.scrollHint} aria-hidden="true">
              ▾ scroll for suggestions
            </div>
          )}
        </div>
        {isSeries && film.seasons && (
          <aside className={s.seasonsRail} aria-label="Seasons and episodes">
            <div className={s.seasonsRailHeader}>
              <span className={s.seasonsRailLabel}>
                {film.seasons.length} season{film.seasons.length === 1 ? "" : "s"}
              </span>
              {episodeStats && (
                <span className={s.seasonsRailStat}>
                  {episodeStats.available} / {episodeStats.total} on disk
                </span>
              )}
            </div>
            <div className={s.seasonsRailScroll}>
              <SeasonsPanel
                seasons={film.seasons}
                defaultOpenFirst
                onSelectEpisode={playEpisode}
              />
            </div>
          </aside>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className={s.suggestions}>
          <PosterRow title="You might also like">
            {suggestions.map((suggestion) => (
              <FilmTile
                key={suggestion.id}
                film={suggestion}
                onClick={() => handleSuggestionClick(suggestion.id)}
              />
            ))}
          </PosterRow>
        </div>
      )}
    </div>
  );
};
