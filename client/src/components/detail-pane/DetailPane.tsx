import { mergeClasses } from "@griffel/react";
import { type FC, useEffect, useState } from "react";
import { graphql, useFragment } from "react-relay";
import { Link, useNavigate } from "react-router-dom";

import { Poster } from "~/components/poster/Poster.js";
import { SeasonsPanel } from "~/components/seasons-panel/SeasonsPanel.js";
import { IconClose, IconExpand, IconPlay, ImdbBadge } from "~/lib/icons.js";
import type { DetailPane_video$key } from "~/relay/__generated__/DetailPane_video.graphql.js";
import { formatDurationHuman, formatFileSize } from "~/utils/formatters.js";
import { withViewTransition } from "~/utils/viewTransition.js";

import { strings } from "./DetailPane.strings.js";
import { useDetailPaneStyles } from "./DetailPane.styles.js";
import { RESOLUTION_LABEL } from "./DetailPane.utils.js";
import { DetailPaneEdit } from "./DetailPaneEdit.js";

const DETAIL_PANE_FRAGMENT = graphql`
  fragment DetailPane_video on Video {
    id
    title
    filename
    mediaType
    durationSeconds
    fileSizeBytes
    bitrate
    nativeResolution
    metadata {
      year
      genre
      director
      plot
      rating
      posterUrl
    }
    videoStream {
      codec
    }
    audioStream {
      codec
      channels
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

interface DetailPaneProps {
  video: DetailPane_video$key;
  initialEdit?: boolean;
  onClose: () => void;
  onEditChange?: (editing: boolean) => void;
}

export const DetailPane: FC<DetailPaneProps> = ({
  video,
  initialEdit = false,
  onClose,
  onEditChange,
}) => {
  const data = useFragment(DETAIL_PANE_FRAGMENT, video);
  const styles = useDetailPaneStyles();
  const navigate = useNavigate();

  const [editing, setEditing] = useState(initialEdit);

  useEffect(() => {
    setEditing(initialEdit);
  }, [initialEdit]);

  const enterEdit = (): void => {
    setEditing(true);
    onEditChange?.(true);
  };

  const exitEdit = (): void => {
    setEditing(false);
    onEditChange?.(false);
  };

  const isSeries = data.mediaType === "TV_SHOWS";
  const altText = data.title || data.filename;
  const titleText = data.title || strings.unmatched;
  const year = data.metadata?.year ?? null;
  const genre = data.metadata?.genre ?? null;
  const plot = data.metadata?.plot ?? null;
  const rating = data.metadata?.rating ?? null;
  const posterUrl = data.metadata?.posterUrl ?? null;
  const codec = data.videoStream?.codec ?? null;
  const audioCodec = data.audioStream?.codec ?? null;
  const audioChannels = data.audioStream?.channels ?? null;
  const resolutionLabel = data.nativeResolution
    ? (RESOLUTION_LABEL[data.nativeResolution] ?? null)
    : null;
  const durationLabel = formatDurationHuman(data.durationSeconds);

  const totalEpisodes = (data.seasons ?? []).reduce((sum, s) => sum + s.episodes.length, 0);
  const onDiskEpisodes = (data.seasons ?? []).reduce(
    (sum, s) => sum + s.episodes.filter((e) => e.onDisk).length,
    0
  );
  const seasonsCount = data.seasons.length;

  const playHref = `/player/${data.id}`;
  const playLabel = strings.play;

  const playEpisode = (seasonNumber: number, episodeNumber: number): void => {
    navigate(`/player/${data.id}?s=${seasonNumber}&e=${episodeNumber}`);
  };

  const expandToOverlay = (): void => {
    withViewTransition(() => navigate(`/?film=${encodeURIComponent(data.id)}`));
  };

  const subheadParts = [year ? String(year) : null, genre, durationLabel || null].filter(
    (p): p is string => Boolean(p)
  );

  return (
    <div className={styles.pane}>
      <div className={styles.posterFrame}>
        <Poster url={posterUrl} alt={altText} className={styles.posterImage} width={1200} />
        <div className={styles.posterFade} />
        <button
          type="button"
          onClick={onClose}
          aria-label={strings.closeLabel}
          className={styles.closeBtn}
        >
          <IconClose />
        </button>
      </div>

      <div className={styles.body}>
        {editing ? (
          <DetailPaneEdit
            videoId={data.id}
            initialQuery={data.title ?? data.filename}
            onDone={exitEdit}
            onCancel={exitEdit}
          />
        ) : (
          <>
            <div className={styles.actionRow}>
              <Link to={playHref} className={styles.playAction}>
                <IconPlay width={11} height={11} />
                <span className={styles.playLabel}>{playLabel}</span>
              </Link>
              <button type="button" onClick={enterEdit} className={styles.editAction}>
                {strings.edit}
              </button>
              {isSeries && (
                <button
                  type="button"
                  onClick={expandToOverlay}
                  aria-label={strings.expandLabel}
                  title={strings.expandTitle}
                  className={styles.expandAction}
                >
                  <IconExpand width={16} height={16} />
                </button>
              )}
            </div>

            <div className={styles.title}>{titleText}</div>
            {subheadParts.length > 0 && (
              <div className={styles.subhead}>{subheadParts.join(" · ")}</div>
            )}

            <div className={styles.techChips}>
              {resolutionLabel && (
                <span className={mergeClasses(styles.chip, styles.chipGreen)}>
                  {resolutionLabel}
                </span>
              )}
              {codec && <span className={styles.chip}>{codec}</span>}
              {audioCodec && (
                <span className={styles.chip}>
                  {audioCodec}
                  {audioChannels ? ` ${audioChannels}ch` : ""}
                </span>
              )}
            </div>

            <div className={styles.ratingRow}>
              {rating !== null && (
                <>
                  <ImdbBadge />
                  <span className={styles.ratingValue}>{rating}</span>
                  <span className={styles.divider}>·</span>
                </>
              )}
              {durationLabel && <span>{durationLabel}</span>}
              <span className={styles.divider}>·</span>
              <span className={styles.status}>● {strings.onDisk}</span>
            </div>

            {plot && <div className={styles.plot}>{plot}</div>}

            {isSeries && seasonsCount > 0 && (
              <>
                <div className={styles.sectionLabel}>{strings.seasons}</div>
                <div className={styles.seasonsSection}>
                  <div className={styles.seasonsHeader}>
                    <span className={styles.seasonsHeaderLabel}>
                      {seasonsCount === 1
                        ? strings.seasonsCountSingular
                        : strings.formatString(strings.seasonsCountPluralFormat, {
                            n: seasonsCount,
                          })}
                    </span>
                    <span className={styles.seasonsHeaderStat}>
                      {strings.formatString(strings.seasonsStatFormat, {
                        available: onDiskEpisodes,
                        total: totalEpisodes,
                      })}
                    </span>
                  </div>
                  <SeasonsPanel video={data} defaultOpenFirst onSelectEpisode={playEpisode} />
                </div>
              </>
            )}

            <div className={styles.sectionLabel}>{strings.file}</div>
            <div className={styles.fileBlock}>
              <div>{data.filename}</div>
              <div className={styles.fileMeta}>
                <span>{formatFileSize(data.fileSizeBytes)}</span>
                {data.bitrate > 0 && (
                  <>
                    <span>·</span>
                    <span>{(data.bitrate / 1000).toFixed(0)} kbps</span>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
