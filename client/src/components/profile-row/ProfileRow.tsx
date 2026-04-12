import { mergeClasses } from "@griffel/react";
import { useNovaEventing } from "@nova/react";
import React, { type FC, type MouseEvent, useState } from "react";
import { graphql, useFragment } from "react-relay";

import { FilmRow } from "~/components/film-row/FilmRow.js";
import { IconChevronDown, IconEdit, IconRefresh } from "~/lib/icons.js";
import type { ProfileRow_library$key } from "~/relay/__generated__/ProfileRow_library.graphql.js";
import { formatFileSize } from "~/utils/formatters.js";

import {
  createProfileRowEditRequestedEvent,
  createProfileRowScanRequestedEvent,
  createProfileRowToggledEvent,
} from "./ProfileRow.events.js";
import { strings } from "./ProfileRow.strings.js";
import { useProfileRowStyles } from "./ProfileRow.styles.js";

const LIBRARY_FRAGMENT = graphql`
  fragment ProfileRow_library on Library {
    id
    name
    path
    mediaType
    stats {
      totalCount
      matchedCount
      unmatchedCount
      totalSizeBytes
    }
    videos(first: 100) {
      edges {
        node {
          id
          ...FilmRow_video
        }
      }
    }
  }
`;

interface Props {
  library: ProfileRow_library$key;
  expanded: boolean;
  selected: boolean;
  selectedFilmId?: string | null;
  scanning?: boolean;
  scanProgress?: { done: number; total: number } | null;
  isPaneOpen?: boolean;
}

export const ProfileRow: FC<Props> = ({
  library,
  expanded,
  selected,
  selectedFilmId = null,
  scanning = false,
  scanProgress = null,
  isPaneOpen = false,
}) => {
  const data = useFragment(LIBRARY_FRAGMENT, library);
  const styles = useProfileRowStyles();
  const [hovered, setHovered] = useState(false);
  const { bubble } = useNovaEventing();

  const totalItems = data.stats.totalCount;
  const matchPct = totalItems > 0 ? Math.round((data.stats.matchedCount / totalItems) * 100) : 0;
  const hasWarn = data.stats.unmatchedCount > 0;
  const typeLabel =
    data.mediaType === "MOVIES"
      ? `${totalItems} ${strings.typeFilms}`
      : data.mediaType === "TV_SHOWS"
        ? `${totalItems} ${strings.typeEpisodes}`
        : `${totalItems} ${strings.typeItems}`;

  const handleRowClick = (e: MouseEvent): void => {
    e.stopPropagation();
    void bubble({ reactEvent: e, event: createProfileRowToggledEvent(data.id) });
  };

  return (
    <>
      <div
        className={mergeClasses(
          styles.row,
          isPaneOpen && styles.rowCompact,
          selected && styles.rowSelected
        )}
        onClick={handleRowClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className={styles.chevron}>
          <span className={styles.chevronInner}>
            <IconChevronDown
              size={10}
              style={{
                transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
                transition: "transform 0.18s ease",
              }}
            />
          </span>
        </div>

        <div className={styles.nameCell}>
          <div className={styles.name}>{data.name}</div>
          {scanning ? (
            <div className={styles.scanLabel}>
              <div className={styles.scanSpinner} />
              <span>
                {scanProgress
                  ? strings.scanningProgress
                      .replace("{done}", String(scanProgress.done))
                      .replace("{total}", String(scanProgress.total))
                  : strings.scanningEllipsis}
              </span>
            </div>
          ) : (
            <div className={styles.path}>{data.path}</div>
          )}
        </div>

        {!isPaneOpen && <div className={styles.cell}>{scanning ? null : typeLabel}</div>}

        {!isPaneOpen && (
          <div className={styles.cell}>
            {!scanning && (
              <div className={styles.matchBar}>
                <div className={styles.matchTrack}>
                  <div
                    className={mergeClasses(styles.matchFill, hasWarn && styles.matchFillWarn)}
                    style={{ width: `${matchPct}%` }}
                  />
                </div>
                <span style={{ fontSize: 11, color: hasWarn ? "#F5C518" : "#666" }}>
                  {matchPct}%
                </span>
              </div>
            )}
          </div>
        )}

        <div className={styles.cell}>
          {scanning ? null : formatFileSize(data.stats.totalSizeBytes)}
        </div>

        <div
          className={mergeClasses(styles.actions, (hovered || selected) && styles.actionsVisible)}
        >
          {scanning ? null : (
            <>
              <button
                className={styles.iconBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  void bubble({
                    reactEvent: e,
                    event: createProfileRowScanRequestedEvent(data.id),
                  });
                }}
                title={strings.refreshTitle}
              >
                <IconRefresh size={11} />
              </button>
              <button
                className={styles.iconBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  void bubble({
                    reactEvent: e,
                    event: createProfileRowEditRequestedEvent(data.id),
                  });
                }}
                title={strings.editTitle}
              >
                <IconEdit size={11} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className={mergeClasses(styles.children, expanded && styles.childrenOpen)}>
        {data.videos.edges.map(({ node }) => (
          <FilmRow
            key={node.id}
            video={node}
            isSelected={node.id === selectedFilmId}
            paneOpen={isPaneOpen}
          />
        ))}
      </div>
    </>
  );
};
