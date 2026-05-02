import { mergeClasses } from "@griffel/react";
import { type FC, type MouseEvent, useState } from "react";
import { graphql, useFragment } from "react-relay";
import { useNavigate } from "react-router-dom";

import { MediaKindBadge } from "~/components/media-kind-badge/MediaKindBadge.js";
import { Poster } from "~/components/poster/Poster.js";
import { SeasonsPanel } from "~/components/seasons-panel/SeasonsPanel.js";
import { IconChevron, IconPlay, ImdbBadge } from "~/lib/icons.js";
import type { FilmRow_video$key } from "~/relay/__generated__/FilmRow_video.graphql.js";
import { formatDurationHuman } from "~/utils/formatters.js";

import { strings } from "./FilmRow.strings.js";
import { useFilmRowStyles } from "./FilmRow.styles.js";

const FILM_FRAGMENT = graphql`
  fragment FilmRow_video on Video {
    id
    title
    filename
    durationSeconds
    matched
    mediaType
    nativeResolution
    metadata {
      year
      genre
      rating
      posterUrl
    }
    seasons {
      seasonNumber
      episodes {
        episodeNumber
        onDisk
      }
    }
    ...SeasonsPanel_video
  }
`;

const RESOLUTION_LABEL: Record<string, string> = {
  RESOLUTION_4K: "4K",
  RESOLUTION_1080P: "1080p",
  RESOLUTION_720P: "720p",
  RESOLUTION_480P: "480p",
  RESOLUTION_360P: "360p",
  RESOLUTION_240P: "240p",
};

interface FilmRowProps {
  video: FilmRow_video$key;
  selected: boolean;
  onOpen: () => void;
  onEdit: () => void;
}

export const FilmRow: FC<FilmRowProps> = ({ video, selected, onOpen, onEdit }) => {
  const data = useFragment(FILM_FRAGMENT, video);
  const styles = useFilmRowStyles();
  const navigate = useNavigate();
  const [seasonsOpen, setSeasonsOpen] = useState(false);

  const isSeries = data.mediaType === "TV_SHOWS";
  const titleText = data.title || data.filename;
  const year = data.metadata?.year ?? null;
  const genre = data.metadata?.genre ?? null;
  const rating = data.metadata?.rating ?? null;
  const posterUrl = data.metadata?.posterUrl ?? null;
  const resolutionLabel = data.nativeResolution
    ? (RESOLUTION_LABEL[data.nativeResolution] ?? null)
    : null;

  const seasonsCount = data.seasons.length;
  const totalEpisodes = data.seasons.reduce((sum, s) => sum + s.episodes.length, 0);
  const onDiskEpisodes = data.seasons.reduce(
    (sum, s) => sum + s.episodes.filter((e) => e.onDisk).length,
    0
  );

  const metaText = isSeries
    ? `${(genre ?? strings.unmatched).toUpperCase()} · ${strings.formatString(strings.seasonsFormat, { n: seasonsCount })} · ${strings.formatString(strings.episodesFormat, { available: onDiskEpisodes, total: totalEpisodes })}`
    : `${(genre ?? strings.unmatched).toUpperCase()} · ${formatDurationHuman(data.durationSeconds)}`;

  const playFilm = (e: MouseEvent): void => {
    e.stopPropagation();
    navigate(`/player/${encodeURIComponent(data.id)}`);
  };
  const editFilm = (e: MouseEvent): void => {
    e.stopPropagation();
    onEdit();
  };
  const toggleSeasons = (e: MouseEvent): void => {
    e.stopPropagation();
    setSeasonsOpen((v) => !v);
  };

  return (
    <div>
      <div onClick={onOpen} className={mergeClasses(styles.row, selected && styles.rowSelected)}>
        <button
          type="button"
          onClick={playFilm}
          aria-label={strings.formatString(strings.playAriaFormat, { title: titleText }) as string}
          className={styles.thumbBtn}
        >
          <Poster url={posterUrl} alt={titleText} className={styles.thumb} width={120} />
          <span className={styles.thumbHover} aria-hidden="true">
            <IconPlay width={14} height={14} />
          </span>
        </button>
        <div className={styles.titleWrap}>
          {isSeries && (
            <button
              type="button"
              onClick={toggleSeasons}
              aria-label={
                strings.formatString(
                  seasonsOpen ? strings.expandAriaCollapseFormat : strings.expandAriaExpandFormat,
                  { title: titleText }
                ) as string
              }
              aria-expanded={seasonsOpen}
              className={mergeClasses(styles.expandBtn, seasonsOpen && styles.expandBtnOpen)}
            >
              <IconChevron />
            </button>
          )}
          <MediaKindBadge kind={data.mediaType} variant="row" />
          <div style={{ minWidth: 0 }}>
            <div className={styles.title}>
              {titleText} {year !== null && <span className={styles.year}>· {year}</span>}
            </div>
            <div className={styles.meta}>{metaText}</div>
          </div>
        </div>
        <div className={styles.chipRow}>
          {resolutionLabel && (
            <span className={mergeClasses(styles.chip, styles.chipGreen)}>{resolutionLabel}</span>
          )}
        </div>
        <div className={styles.ratingCell}>
          {rating !== null && (
            <>
              <ImdbBadge />
              <span className={styles.ratingValue}>{rating}</span>
            </>
          )}
        </div>
        <div className={styles.editCell}>
          <button type="button" onClick={editFilm} className={styles.editAction}>
            {strings.edit}
          </button>
        </div>
      </div>
      {isSeries && seasonsOpen && seasonsCount > 0 && (
        <div className={styles.expandedHost}>
          <SeasonsPanel video={data} defaultOpenFirst />
        </div>
      )}
    </div>
  );
};
