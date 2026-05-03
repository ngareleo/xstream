import { mergeClasses } from "@griffel/react";
import { type FC } from "react";
import { graphql, useFragment } from "react-relay";

import { IconChevron } from "~/lib/icons";
import type { Season_season$key } from "~/relay/__generated__/Season_season.graphql";

import { Episode } from "./Episode";
import { strings } from "./SeasonsPanel.strings";
import { useSeasonsPanelStyles } from "./SeasonsPanel.styles";

const SEASON_FRAGMENT = graphql`
  fragment Season_season on Season {
    seasonNumber
    episodes {
      episodeNumber
      onDisk
      ...Episode_episode
    }
  }
`;

interface SeasonProps {
  season: Season_season$key;
  isOpen: boolean;
  onToggle: (seasonNumber: number) => void;
  activeEpisodeNumber?: number;
  onSelectEpisode?: (seasonNumber: number, episodeNumber: number) => void;
}

export const Season: FC<SeasonProps> = ({
  season,
  isOpen,
  onToggle,
  activeEpisodeNumber,
  onSelectEpisode,
}) => {
  const data = useFragment(SEASON_FRAGMENT, season);
  const styles = useSeasonsPanelStyles();

  const total = data.episodes.length;
  const available = data.episodes.filter((e) => e.onDisk).length;
  const pct = total === 0 ? 0 : (available / total) * 100;
  const status = available === total ? "complete" : available === 0 ? "empty" : "partial";

  return (
    <div className={styles.season}>
      <button
        type="button"
        onClick={() => onToggle(data.seasonNumber)}
        className={mergeClasses(styles.seasonHeader, isOpen && styles.seasonHeaderOpen)}
        aria-expanded={isOpen}
      >
        <span
          className={mergeClasses(styles.chevron, isOpen && styles.chevronOpen)}
          aria-hidden="true"
        >
          <IconChevron />
        </span>
        <span className={styles.seasonLabel}>
          <span className={styles.seasonName}>
            {strings.formatString(strings.seasonName, { n: data.seasonNumber })}
          </span>
          <span className={styles.seasonMeta}>
            {strings.formatString(strings.onDiskFormat, { onDisk: available, total })}
          </span>
        </span>
        <span className={styles.miniBar} aria-hidden="true">
          <span
            className={mergeClasses(
              styles.miniFill,
              status === "partial" && styles.miniFillPartial
            )}
            style={{ width: `${pct}%` }}
          />
        </span>
        <span
          className={mergeClasses(
            styles.seasonStatus,
            status === "complete" && styles.seasonStatusComplete,
            status === "partial" && styles.seasonStatusPartial,
            status === "empty" && styles.seasonStatusEmpty
          )}
        >
          {status === "complete"
            ? strings.statusOnDisk
            : status === "empty"
              ? strings.statusMissing
              : strings.statusPartial}
        </span>
      </button>

      {isOpen && (
        <div className={styles.episodes}>
          {data.episodes.map((ep) => (
            <Episode
              key={ep.episodeNumber}
              episode={ep}
              isActive={activeEpisodeNumber === ep.episodeNumber}
              onSelect={onSelectEpisode}
            />
          ))}
        </div>
      )}
    </div>
  );
};
