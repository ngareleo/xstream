import { mergeClasses } from "@griffel/react";
import { type FC } from "react";
import { graphql, useFragment } from "react-relay";
import { Link } from "react-router-dom";

import { SeasonsPanel } from "~/components/seasons-panel/SeasonsPanel.js";
import { IconClose, IconPlay } from "~/lib/icons.js";
import type { PlayerSidebar_video$key } from "~/relay/__generated__/PlayerSidebar_video.graphql.js";
import { formatDuration } from "~/utils/formatters.js";

import { strings } from "./PlayerSidebar.strings.js";
import { usePlayerSidebarStyles } from "./PlayerSidebar.styles.js";

export interface SidebarSeriesPick {
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string | null;
}

const VIDEO_FRAGMENT = graphql`
  fragment PlayerSidebar_video on Video
  @argumentDefinitions(posterSize: { type: "PosterSize!", defaultValue: W400 }) {
    id
    title
    durationSeconds
    metadata {
      title
      year
      genre
      plot
    }
    library {
      videos(first: 6) {
        edges {
          node {
            id
            title
            metadata {
              year
              tilePoster: posterUrl(size: $posterSize)
            }
          }
        }
      }
    }
    ...SeasonsPanel_video
  }
`;

interface Props {
  video: PlayerSidebar_video$key;
  open: boolean;
  seriesPick: SidebarSeriesPick | null;
  onClose: () => void;
  onBack: () => void;
  onSelectEpisode: (seasonNumber: number, episodeNumber: number) => void;
}

function formatEpisodeCode(seasonNumber: number, episodeNumber: number): string {
  return `S${String(seasonNumber).padStart(2, "0")}E${String(episodeNumber).padStart(2, "0")}`;
}

export const PlayerSidebar: FC<Props> = ({
  video,
  open,
  seriesPick,
  onClose,
  onBack,
  onSelectEpisode,
}) => {
  const data = useFragment(VIDEO_FRAGMENT, video);
  const styles = usePlayerSidebarStyles();

  const meta = data.metadata;
  const displayTitle = meta?.title ?? data.title ?? strings.untitled;
  const metaLine = [
    meta?.year ?? null,
    meta?.genre?.split("·")[0]?.trim() ?? null,
    formatDuration(data.durationSeconds),
  ]
    .filter(Boolean)
    .join(" · ");
  const episodeCode = seriesPick
    ? formatEpisodeCode(seriesPick.seasonNumber, seriesPick.episodeNumber)
    : null;

  const upNext = (data.library?.videos.edges ?? [])
    .map((e) => e.node)
    .filter((v) => v.id !== data.id)
    .slice(0, 3);

  const activeEpisode = seriesPick
    ? { seasonNumber: seriesPick.seasonNumber, episodeNumber: seriesPick.episodeNumber }
    : undefined;

  return (
    <aside aria-hidden={!open} className={mergeClasses(styles.root, !open && styles.rootHidden)}>
      <button
        type="button"
        aria-label={strings.closeAriaLabel}
        className={styles.closeBtn}
        onClick={onClose}
      >
        <IconClose size={14} />
      </button>

      <div className={styles.header}>
        <div className={mergeClasses(styles.eyebrow, styles.nowPlayingEyebrow)}>
          {strings.nowPlaying}
        </div>
        <div className={styles.title}>{displayTitle}</div>
        {metaLine && <div className={styles.meta}>{metaLine}</div>}
        {seriesPick && episodeCode != null && (
          <div className={styles.episodeRow}>
            <span className={styles.episodeCode}>{episodeCode}</span>
            {seriesPick.episodeTitle != null && (
              <span className={styles.episodeTitle}>{seriesPick.episodeTitle}</span>
            )}
          </div>
        )}
        {meta?.plot != null && meta.plot.length > 0 && (
          <div className={styles.plot}>{meta.plot}</div>
        )}
      </div>

      <div className={styles.body}>
        {seriesPick ? (
          <>
            <div className={mergeClasses(styles.eyebrow, styles.bodyEyebrow)}>
              {strings.episodes}
            </div>
            <SeasonsPanel
              video={data}
              accordion
              activeEpisode={activeEpisode}
              onSelectEpisode={onSelectEpisode}
            />
          </>
        ) : (
          <>
            <div className={mergeClasses(styles.eyebrow, styles.bodyEyebrow)}>{strings.upNext}</div>
            {upNext.length === 0 ? (
              <div className={styles.upNextEmpty}>{strings.upNextEmpty}</div>
            ) : (
              upNext.map((v) => {
                const posterStyle = v.metadata?.tilePoster
                  ? { backgroundImage: `url(${v.metadata.tilePoster})` }
                  : undefined;
                return (
                  <Link key={v.id} to={`/player/${v.id}`} replace className={styles.upNextRow}>
                    <div className={styles.upNextPoster} style={posterStyle} />
                    <div className={styles.upNextInfo}>
                      <div className={styles.upNextTitle}>{v.title}</div>
                      {v.metadata?.year != null && (
                        <div className={styles.upNextSub}>{v.metadata.year}</div>
                      )}
                    </div>
                    <span
                      aria-label={
                        strings.formatString(strings.playAriaLabelFormat, {
                          title: v.title,
                        }) as string
                      }
                      className={styles.upNextPlay}
                    >
                      <IconPlay size={10} />
                    </span>
                  </Link>
                );
              })
            )}
          </>
        )}
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.vlcBtn}>
          {strings.openInVlc}
        </button>
        <button type="button" onClick={onBack} className={styles.backBtn}>
          {strings.back}
        </button>
      </div>
    </aside>
  );
};
