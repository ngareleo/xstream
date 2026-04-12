import { mergeClasses } from "@griffel/react";
import { type FC } from "react";
import { graphql, useFragment } from "react-relay";
import { Link } from "react-router-dom";

import { IconPlay } from "~/lib/icons.js";
import type { LibraryFilmListRow_video$key } from "~/relay/__generated__/LibraryFilmListRow_video.graphql.js";
import { formatDuration, formatFileSize } from "~/utils/formatters.js";

import { useLibraryFilmListRowStyles } from "./LibraryFilmListRow.styles.js";

const FRAGMENT = graphql`
  fragment LibraryFilmListRow_video on Video {
    id
    title
    matched
    durationSeconds
    fileSizeBytes
    metadata {
      year
      genre
      rating
      posterUrl
    }
    videoStream {
      height
    }
  }
`;

interface Props {
  video: LibraryFilmListRow_video$key;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

export const LibraryFilmListRow: FC<Props> = ({ video, isSelected, onSelect }) => {
  const data = useFragment(FRAGMENT, video);
  const styles = useLibraryFilmListRowStyles();

  const is4k = (data.videoStream?.height ?? 0) >= 2160;
  const thumbStyle = data.metadata?.posterUrl
    ? { backgroundImage: `url(${data.metadata.posterUrl})` }
    : undefined;
  const year = data.metadata?.year ?? null;
  const genre = data.metadata?.genre ?? null;
  const rating = data.metadata?.rating ?? null;

  return (
    <div
      className={mergeClasses(styles.listRow, isSelected && styles.listRowSelected)}
      onClick={() => onSelect(data.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect(data.id);
      }}
    >
      <div className={styles.listThumb} style={thumbStyle} />
      <div className={styles.listInfo}>
        <div className={styles.listTitle}>{data.title}</div>
        {(year ?? genre) && (
          <div className={styles.listMeta}>{[year, genre].filter(Boolean).join(" · ")}</div>
        )}
      </div>
      <div className={styles.listCell}>{is4k ? "4K" : "HD"}</div>
      <div className={styles.listCell}>{rating != null ? `★ ${rating.toFixed(1)}` : "—"}</div>
      <div className={styles.listCell}>{formatDuration(data.durationSeconds)}</div>
      <div className={styles.listCell}>
        {data.matched ? (
          <Link
            to={`/player/${encodeURIComponent(data.id)}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              color: "inherit",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <IconPlay size={9} />
            {formatFileSize(data.fileSizeBytes)}
          </Link>
        ) : (
          formatFileSize(data.fileSizeBytes)
        )}
      </div>
    </div>
  );
};
