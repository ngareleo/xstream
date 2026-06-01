import { mergeClasses } from "@griffel/react";
import { type FC, Suspense, useCallback, useState } from "react";
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
  fragment VideoArea_video on Video
  @argumentDefinitions(posterSize: { type: "PosterSize!", defaultValue: W3200 }) {
    title
    durationSeconds
    metadata {
      title
      year
      genre
      heroPoster: posterUrl(size: $posterSize)
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
  // The backdrop poster covers the idle/loading state before the first frame.
  // Once playback has begun it stays hidden for the rest of the session — a
  // stall or seek drops status back to "loading", and we don't want the poster
  // flashing back behind the letterboxed video each time.
  const [hasPlayed, setHasPlayed] = useState(false);
  const handleStatusChange = useCallback((status: PlayStatus): void => {
    if (status === "playing") setHasPlayed(true);
  }, []);

  const fadeClass = mergeClasses(styles.fade, controlsHidden && styles.fadeHidden);
  const meta = data.metadata;
  const displayTitle = meta?.title ?? data.title ?? strings.untitled;
  const posterUrl = meta?.heroPoster ?? null;
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
      {!hasPlayed && <Poster url={posterUrl} alt={displayTitle} className={styles.backdrop} />}

      <div className={styles.videoWrapper}>
        <Suspense fallback={null}>
          <VideoPlayerAsync video={data} onStatusChange={handleStatusChange} />
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
