import type { FC } from "react";
import { graphql, useFragment } from "react-relay";

import { MediaKindBadge } from "~/components/media-kind-badge/MediaKindBadge";
import { Poster } from "~/components/poster/Poster";
import type { FilmTile_video$key } from "~/relay/__generated__/FilmTile_video.graphql";
import { formatDurationHuman } from "~/utils/formatters";

import { useFilmTileStyles } from "./FilmTile.styles";

const FILM_TILE_FRAGMENT = graphql`
  fragment FilmTile_video on Video {
    id
    title
    filename
    mediaType
    durationSeconds
    metadata {
      year
      posterUrl
    }
  }
`;

interface FilmTileProps {
  video: FilmTile_video$key;
  progress?: number;
  onClick: (id: string) => void;
}

export const FilmTile: FC<FilmTileProps> = ({ video, progress, onClick }) => {
  const data = useFragment(FILM_TILE_FRAGMENT, video);
  const styles = useFilmTileStyles();
  const altText = data.title || data.filename;
  const durationLabel = data.durationSeconds > 0 ? formatDurationHuman(data.durationSeconds) : null;
  const subtitleParts = [data.metadata?.year, durationLabel].filter(
    (v): v is number | string => v !== null && v !== undefined && v !== ""
  );
  return (
    <button type="button" onClick={() => onClick(data.id)} className={styles.tile}>
      <div className={styles.frame}>
        <Poster url={data.metadata?.posterUrl ?? null} alt={altText} className={styles.image} />
        <MediaKindBadge kind={data.mediaType} variant="tile" />
        {progress !== undefined && (
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      <div className={styles.meta}>
        <div className={styles.title}>{altText}</div>
        <div className={styles.subtitle}>{subtitleParts.join(" · ")}</div>
      </div>
    </button>
  );
};
