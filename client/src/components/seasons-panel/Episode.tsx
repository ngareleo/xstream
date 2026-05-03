import { mergeClasses } from "@griffel/react";
import { type FC } from "react";
import { graphql, useFragment } from "react-relay";

import type { Episode_episode$key } from "~/relay/__generated__/Episode_episode.graphql";
import { formatDurationHuman } from "~/utils/formatters";

import { strings } from "./SeasonsPanel.strings";
import { useSeasonsPanelStyles } from "./SeasonsPanel.styles";

const EPISODE_FRAGMENT = graphql`
  fragment Episode_episode on Episode {
    seasonNumber
    episodeNumber
    title
    durationSeconds
    onDisk
  }
`;

interface EpisodeProps {
  episode: Episode_episode$key;
  isActive: boolean;
  onSelect?: (seasonNumber: number, episodeNumber: number) => void;
}

export const Episode: FC<EpisodeProps> = ({ episode, isActive, onSelect }) => {
  const ep = useFragment(EPISODE_FRAGMENT, episode);
  const styles = useSeasonsPanelStyles();

  const code = `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`;
  const clickable = Boolean(onSelect) && ep.onDisk;
  const duration =
    ep.durationSeconds && ep.durationSeconds > 0 ? formatDurationHuman(ep.durationSeconds) : "";
  const titleText =
    ep.title ?? (strings.formatString(strings.episodeFallback, { n: ep.episodeNumber }) as string);

  const statusEl = !ep.onDisk ? (
    <span
      className={mergeClasses(styles.episodeDot, styles.episodeDotMissing)}
      aria-label={strings.dotMissing}
      title={strings.dotMissing}
    />
  ) : (
    <span className={styles.episodeDot} aria-label={strings.dotOnDisk} title={strings.dotOnDisk} />
  );

  const rowContent = (
    <>
      <span className={styles.episodeCode}>{code}</span>
      <span className={styles.episodeTitle} title={titleText}>
        {isActive && <span className={styles.episodePlayingMark}>{strings.playing}</span>}
        {titleText}
      </span>
      <span className={styles.episodeDuration}>{duration}</span>
      {statusEl}
    </>
  );

  const rowClass = mergeClasses(
    styles.episode,
    !ep.onDisk && styles.episodeMissing,
    isActive && styles.episodeActive
  );

  if (clickable && onSelect) {
    return (
      <button
        type="button"
        onClick={() => onSelect(ep.seasonNumber, ep.episodeNumber)}
        aria-current={isActive ? "true" : undefined}
        className={mergeClasses(rowClass, styles.episodeButton, styles.episodeButtonAvailable)}
      >
        {rowContent}
      </button>
    );
  }

  return <div className={rowClass}>{rowContent}</div>;
};
