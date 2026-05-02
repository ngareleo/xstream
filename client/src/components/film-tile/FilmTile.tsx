import type { FC } from "react";

import { type MediaKind, MediaKindBadge } from "~/components/media-kind-badge/MediaKindBadge";
import { Poster } from "~/components/poster/Poster";

import { useFilmTileStyles } from "./FilmTile.styles";

export interface FilmTileViewModel {
  id: string;
  title: string | null;
  filename: string;
  kind: MediaKind;
  posterUrl: string | null;
  year: number | null;
  durationLabel: string | null;
}

interface FilmTileProps {
  film: FilmTileViewModel;
  progress?: number;
  onClick: () => void;
}

export const FilmTile: FC<FilmTileProps> = ({ film, progress, onClick }) => {
  const styles = useFilmTileStyles();
  const altText = film.title ?? film.filename;
  return (
    <button type="button" onClick={onClick} className={styles.tile}>
      <div className={styles.frame}>
        <Poster url={film.posterUrl} alt={altText} className={styles.image} />
        <MediaKindBadge kind={film.kind} variant="tile" />
        {progress !== undefined && (
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      <div className={styles.meta}>
        <div className={styles.title}>{altText}</div>
        <div className={styles.subtitle}>
          {[film.year, film.durationLabel]
            .filter((v): v is number | string => v !== null && v !== undefined && v !== "")
            .join(" · ")}
        </div>
      </div>
    </button>
  );
};
