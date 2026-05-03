import { type FC, useMemo, useState } from "react";
import { graphql, useFragment } from "react-relay";

import type { SeasonsPanel_video$key } from "~/relay/__generated__/SeasonsPanel_video.graphql";

import { Season } from "./Season";
import { useSeasonsPanelStyles } from "./SeasonsPanel.styles";

const SEASONS_FRAGMENT = graphql`
  fragment SeasonsPanel_video on Video {
    seasons {
      seasonNumber
      ...Season_season
    }
  }
`;

export interface ActiveEpisode {
  seasonNumber: number;
  episodeNumber: number;
}

interface SeasonsPanelProps {
  video: SeasonsPanel_video$key;
  defaultOpenFirst?: boolean;
  activeEpisode?: ActiveEpisode;
  onSelectEpisode?: (seasonNumber: number, episodeNumber: number) => void;
  accordion?: boolean;
}

export const SeasonsPanel: FC<SeasonsPanelProps> = ({
  video,
  defaultOpenFirst = false,
  activeEpisode,
  onSelectEpisode,
  accordion = false,
}) => {
  const data = useFragment(SEASONS_FRAGMENT, video);
  const styles = useSeasonsPanelStyles();
  const seasons = data.seasons;

  const initial = useMemo<Set<number>>(() => {
    const set = new Set<number>();
    if (activeEpisode) {
      set.add(activeEpisode.seasonNumber);
      if (accordion) return set;
    }
    if (defaultOpenFirst && seasons.length > 0) {
      const first = seasons[0];
      if (first) set.add(first.seasonNumber);
    }
    return set;
  }, [defaultOpenFirst, seasons, activeEpisode, accordion]);
  const [expanded, setExpanded] = useState<Set<number>>(initial);

  const toggle = (n: number): void => {
    setExpanded((prev) => {
      if (accordion) {
        if (prev.has(n)) return new Set<number>();
        return new Set<number>([n]);
      }
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  return (
    <div className={styles.panel}>
      {seasons.map((season) => (
        <Season
          key={season.seasonNumber}
          season={season}
          isOpen={expanded.has(season.seasonNumber)}
          onToggle={toggle}
          activeEpisodeNumber={
            activeEpisode && activeEpisode.seasonNumber === season.seasonNumber
              ? activeEpisode.episodeNumber
              : undefined
          }
          onSelectEpisode={onSelectEpisode}
        />
      ))}
    </div>
  );
};
