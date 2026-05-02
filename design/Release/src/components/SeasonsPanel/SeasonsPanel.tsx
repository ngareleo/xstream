import { type CSSProperties, type FC, useMemo, useState } from "react";
import { mergeClasses } from "@griffel/react";
import { type Season } from "../../data/mock.js";
import { IconCheck, IconChevron } from "../../lib/icons.js";
import { useSeasonsPanelStyles } from "./SeasonsPanel.styles.js";

export interface ActiveEpisode {
  seasonNumber: number;
  episodeNumber: number;
}

interface SeasonsPanelProps {
  seasons: Season[];
  /**
   * If true, the first season starts expanded. Use on the DetailPane side
   * pane where the user is exploring a single show. Defaults to false in
   * the inline tree where many shows can be expanded at once.
   */
  defaultOpenFirst?: boolean;
  /**
   * Currently-playing episode. When set, that row is highlighted and its
   * containing season is auto-expanded so the player UI keeps the active
   * episode visible without needing the user to drill in.
   */
  activeEpisode?: ActiveEpisode;
  /**
   * When provided, available episode rows become clickable and call this
   * with the season + episode numbers. Missing episodes never fire it.
   */
  onSelectEpisode?: (seasonNumber: number, episodeNumber: number) => void;
  /**
   * When true, only one season can be expanded at a time — opening a
   * season collapses any other open season. Used by the Player side
   * panel where the rail is narrow and stacked open seasons would push
   * the active episode out of view.
   */
  accordion?: boolean;
}

/**
 * Vertical season → episode browser shared between the profile-row
 * inline expansion, the DetailPane side panel, and the Player side
 * panel. Each season is collapsible and surfaces an "X of Y on disk"
 * mini progress bar. Episodes render as a tight grid: code (S01E03),
 * title, duration, availability dot.
 *
 * Pass `activeEpisode` + `onSelectEpisode` to use it as a player
 * picker — the active row gets a green left-rail and the season it
 * belongs to opens automatically.
 */
export const SeasonsPanel: FC<SeasonsPanelProps> = ({
  seasons,
  defaultOpenFirst = false,
  activeEpisode,
  onSelectEpisode,
  accordion = false,
}) => {
  const s = useSeasonsPanelStyles();
  const initial = useMemo<Set<number>>(() => {
    const set = new Set<number>();
    if (activeEpisode) {
      set.add(activeEpisode.seasonNumber);
      // Accordion only ever holds one season open at a time; the active
      // episode wins over `defaultOpenFirst`.
      if (accordion) return set;
    }
    if (defaultOpenFirst && seasons.length > 0) set.add(seasons[0].number);
    return set;
  }, [defaultOpenFirst, seasons, activeEpisode, accordion]);
  const [expanded, setExpanded] = useState<Set<number>>(initial);

  const toggle = (n: number): void => {
    setExpanded((prev) => {
      if (accordion) {
        // Single-open mode: clicking the active season collapses it,
        // any other season replaces it.
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
    <div className={s.panel}>
      {seasons.map((season) => {
        const total = season.episodes.length;
        const available = season.episodes.filter((e) => e.available).length;
        const watchedCount = season.episodes.filter((e) => e.watched).length;
        const pct = total === 0 ? 0 : (available / total) * 100;
        const status =
          available === total
            ? "complete"
            : available === 0
              ? "empty"
              : "partial";
        const isOpen = expanded.has(season.number);

        return (
          <div key={season.number} className={s.season}>
            <button
              type="button"
              onClick={() => toggle(season.number)}
              className={mergeClasses(
                s.seasonHeader,
                isOpen && s.seasonHeaderOpen,
              )}
              aria-expanded={isOpen}
            >
              <span
                className={mergeClasses(s.chevron, isOpen && s.chevronOpen)}
                aria-hidden="true"
              >
                <IconChevron />
              </span>
              <span className={s.seasonLabel}>
                <span className={s.seasonName}>Season {season.number}</span>
                <span className={s.seasonMeta}>
                  {available} of {total} on disk
                  {watchedCount > 0 && (
                    <span className={s.seasonMetaWatched}>
                      · ✓ {watchedCount} watched
                    </span>
                  )}
                </span>
              </span>
              <span className={s.miniBar} aria-hidden="true">
                <span
                  className={mergeClasses(
                    s.miniFill,
                    status === "partial" && s.miniFillPartial,
                  )}
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span
                className={mergeClasses(
                  s.seasonStatus,
                  status === "complete" && s.seasonStatusComplete,
                  status === "partial" && s.seasonStatusPartial,
                  status === "empty" && s.seasonStatusEmpty,
                )}
              >
                {status === "complete"
                  ? "ON DISK"
                  : status === "empty"
                    ? "MISSING"
                    : "PARTIAL"}
              </span>
            </button>

            {isOpen && (
              <div className={s.episodes}>
                {season.episodes.map((ep) => {
                  const code = `S${String(season.number).padStart(2, "0")}E${String(ep.number).padStart(2, "0")}`;
                  const isActive =
                    activeEpisode !== undefined &&
                    activeEpisode.seasonNumber === season.number &&
                    activeEpisode.episodeNumber === ep.number;
                  const clickable = Boolean(onSelectEpisode) && ep.available;
                  const isWatched = ep.watched === true && !isActive;
                  const isInProgress =
                    !isActive &&
                    !ep.watched &&
                    typeof ep.progress === "number" &&
                    ep.progress > 0 &&
                    ep.progress < 100;

                  // Right-side status indicator follows availability +
                  // watched state. Active row gets the panel's left-rail
                  // highlight already; we keep its dot consistent with
                  // "on disk" so the row reads as the live target.
                  const statusEl = !ep.available ? (
                    <span
                      className={mergeClasses(s.episodeDot, s.episodeDotMissing)}
                      aria-label="Missing"
                      title="Missing"
                    />
                  ) : isWatched ? (
                    <span
                      className={mergeClasses(s.episodeStatus, s.episodeCheck)}
                      aria-label="Watched"
                      title="Watched"
                    >
                      <IconCheck width={12} height={12} />
                    </span>
                  ) : isInProgress ? (
                    <span
                      className={mergeClasses(
                        s.episodeDot,
                        s.episodeDotInProgress,
                      )}
                      style={
                        { "--ep-pct": `${ep.progress}%` } as CSSProperties
                      }
                      aria-label={`In progress — ${ep.progress}%`}
                      title={`${ep.progress}% watched`}
                    />
                  ) : (
                    <span
                      className={s.episodeDot}
                      aria-label="On disk"
                      title="On disk"
                    />
                  );

                  const rowContent = (
                    <>
                      <span
                        className={mergeClasses(
                          s.episodeCode,
                          isWatched && s.episodeWatchedCode,
                        )}
                      >
                        {code}
                      </span>
                      <span
                        className={mergeClasses(
                          s.episodeTitle,
                          isWatched && s.episodeWatchedTitle,
                        )}
                        title={ep.title}
                      >
                        {isActive && (
                          <span className={s.episodePlayingMark}>● PLAYING</span>
                        )}
                        {ep.title}
                      </span>
                      <span className={s.episodeDuration}>{ep.duration}</span>
                      {statusEl}
                      {isInProgress && (
                        <span
                          className={s.episodeInProgressBar}
                          aria-hidden="true"
                        >
                          <span
                            className={s.episodeInProgressFill}
                            style={{ width: `${ep.progress}%` }}
                          />
                        </span>
                      )}
                    </>
                  );

                  const rowClass = mergeClasses(
                    s.episode,
                    !ep.available && s.episodeMissing,
                    isWatched && s.episodeWatched,
                    isActive && s.episodeActive,
                  );

                  if (clickable && onSelectEpisode) {
                    return (
                      <button
                        type="button"
                        key={ep.number}
                        onClick={() => onSelectEpisode(season.number, ep.number)}
                        aria-current={isActive ? "true" : undefined}
                        className={mergeClasses(
                          rowClass,
                          s.episodeButton,
                          s.episodeButtonAvailable,
                        )}
                      >
                        {rowContent}
                      </button>
                    );
                  }

                  return (
                    <div key={ep.number} className={rowClass}>
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
