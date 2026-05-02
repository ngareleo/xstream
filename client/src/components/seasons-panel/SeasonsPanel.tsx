import { mergeClasses } from "@griffel/react";
import { type FC, useMemo, useState } from "react";
import { graphql, useFragment } from "react-relay";

import { IconChevron } from "~/lib/icons";
import type { SeasonsPanel_video$key } from "~/relay/__generated__/SeasonsPanel_video.graphql";
import { formatDurationHuman } from "~/utils/formatters";

import { strings } from "./SeasonsPanel.strings";
import { useSeasonsPanelStyles } from "./SeasonsPanel.styles";

const SEASONS_FRAGMENT = graphql`
  fragment SeasonsPanel_video on Video {
    seasons {
      seasonNumber
      episodes {
        episodeNumber
        title
        durationSeconds
        onDisk
      }
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
      {seasons.map((season) => {
        const total = season.episodes.length;
        const available = season.episodes.filter((e) => e.onDisk).length;
        const pct = total === 0 ? 0 : (available / total) * 100;
        const status = available === total ? "complete" : available === 0 ? "empty" : "partial";
        const isOpen = expanded.has(season.seasonNumber);

        return (
          <div key={season.seasonNumber} className={styles.season}>
            <button
              type="button"
              onClick={() => toggle(season.seasonNumber)}
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
                  {strings.formatString(strings.seasonName, { n: season.seasonNumber })}
                </span>
                <span className={styles.seasonMeta}>
                  {strings.formatString(strings.onDiskFormat, {
                    onDisk: available,
                    total,
                  })}
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
                {season.episodes.map((ep) => {
                  const code = `S${String(season.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`;
                  const isActive =
                    activeEpisode !== undefined &&
                    activeEpisode.seasonNumber === season.seasonNumber &&
                    activeEpisode.episodeNumber === ep.episodeNumber;
                  const clickable = Boolean(onSelectEpisode) && ep.onDisk;
                  const duration =
                    ep.durationSeconds && ep.durationSeconds > 0
                      ? formatDurationHuman(ep.durationSeconds)
                      : "";
                  const titleText =
                    ep.title ??
                    (strings.formatString(strings.episodeFallback, {
                      n: ep.episodeNumber,
                    }) as string);

                  const statusEl = !ep.onDisk ? (
                    <span
                      className={mergeClasses(styles.episodeDot, styles.episodeDotMissing)}
                      aria-label={strings.dotMissing}
                      title={strings.dotMissing}
                    />
                  ) : (
                    <span
                      className={styles.episodeDot}
                      aria-label={strings.dotOnDisk}
                      title={strings.dotOnDisk}
                    />
                  );

                  const rowContent = (
                    <>
                      <span className={styles.episodeCode}>{code}</span>
                      <span className={styles.episodeTitle} title={titleText}>
                        {isActive && (
                          <span className={styles.episodePlayingMark}>{strings.playing}</span>
                        )}
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

                  if (clickable && onSelectEpisode) {
                    return (
                      <button
                        type="button"
                        key={ep.episodeNumber}
                        onClick={() => onSelectEpisode(season.seasonNumber, ep.episodeNumber)}
                        aria-current={isActive ? "true" : undefined}
                        className={mergeClasses(
                          rowClass,
                          styles.episodeButton,
                          styles.episodeButtonAvailable
                        )}
                      >
                        {rowContent}
                      </button>
                    );
                  }

                  return (
                    <div key={ep.episodeNumber} className={rowClass}>
                      {rowContent}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
