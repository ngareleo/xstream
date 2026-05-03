import { mergeClasses } from "@griffel/react";
import { type FC, Suspense, useState } from "react";
import { graphql, useFragment } from "react-relay";

import { Poster } from "~/components/poster/Poster.js";
import { VideoPlayerAsync } from "~/components/video-player/VideoPlayerAsync.js";
import { IconBack } from "~/lib/icons.js";
import type { VideoArea_video$key } from "~/relay/__generated__/VideoArea_video.graphql.js";
import { formatDuration } from "~/utils/formatters.js";

import { strings } from "./VideoArea.strings.js";
import { useVideoAreaStyles } from "./VideoArea.styles.js";

type PlayStatus = "idle" | "loading" | "playing";

export interface SeriesPick {
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string | null;
  episodeDurationSeconds: number | null;
}

const VIDEO_FRAGMENT = graphql`
  fragment VideoArea_video on Video {
    title
    durationSeconds
    metadata {
      title
      year
      genre
      posterUrl
    }
    ...VideoPlayer_video
  }
`;

interface Props {
  video: VideoArea_video$key;
  seriesPick: SeriesPick | null;
  controlsHidden: boolean;
  onBack: () => void;
}

function formatEpisodeCode(seasonNumber: number, episodeNumber: number): string {
  return `S${String(seasonNumber).padStart(2, "0")}E${String(episodeNumber).padStart(2, "0")}`;
}

export const VideoArea: FC<Props> = ({ video, seriesPick, controlsHidden, onBack }) => {
  const styles = useVideoAreaStyles();
  const data = useFragment(VIDEO_FRAGMENT, video);
  const [playStatus, setPlayStatus] = useState<PlayStatus>("idle");

  const fadeClass = mergeClasses(styles.fade, controlsHidden && styles.fadeHidden);
  const meta = data.metadata;
  const displayTitle = meta?.title ?? data.title ?? strings.untitled;
  const posterUrl = meta?.posterUrl ?? null;
  const episodeCode = seriesPick
    ? formatEpisodeCode(seriesPick.seasonNumber, seriesPick.episodeNumber)
    : null;

  const metaLine = seriesPick
    ? [
        `Season ${seriesPick.seasonNumber}`,
        meta?.genre ?? null,
        seriesPick.episodeDurationSeconds != null
          ? formatDuration(seriesPick.episodeDurationSeconds)
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : [meta?.year ?? null, meta?.genre ?? null, formatDuration(data.durationSeconds)]
        .filter(Boolean)
        .join(" · ");

  return (
    <div className={styles.root}>
      {playStatus !== "playing" && (
        <Poster url={posterUrl} alt={displayTitle} className={styles.backdrop} width={1600} />
      )}

      <div className={styles.videoWrapper}>
        <Suspense fallback={null}>
          <VideoPlayerAsync video={data} onStatusChange={setPlayStatus} />
        </Suspense>
      </div>

      <div className={styles.grain} />

      <div className={mergeClasses(styles.letterTop, fadeClass)} />
      <div className={mergeClasses(styles.letterBottom, fadeClass)} />

      <div className={mergeClasses(styles.topbar, fadeClass)}>
        <button
          type="button"
          onClick={onBack}
          aria-label={strings.backAriaLabel}
          className={styles.topbarBtn}
        >
          <IconBack size={14} />
        </button>
      </div>

      <div className={mergeClasses(styles.titleOverlay, fadeClass)}>
        {seriesPick && episodeCode != null && (
          <div className={styles.episodeBadge}>
            <span className={styles.episodeBadgeCode}>{episodeCode}</span>
            {seriesPick.episodeTitle != null && (
              <span className={styles.episodeBadgeTitle}>{seriesPick.episodeTitle}</span>
            )}
          </div>
        )}
        <div className={styles.filmTitle}>{displayTitle}</div>
        {metaLine && <div className={styles.filmMeta}>{metaLine}</div>}
      </div>
    </div>
  );
};
