import { mergeClasses } from "@griffel/react";
import { useNovaEventing } from "@nova/react";
import React, { type FC, type MouseEvent, useState } from "react";
import { graphql, useFragment } from "react-relay";

import { FilmRow } from "~/components/film-row/FilmRow.js";
import { IconChevronDown, IconPencil, IconRefresh } from "~/lib/icons.js";
import type { ProfileRow_library$key } from "~/relay/__generated__/ProfileRow_library.graphql.js";
import { formatFileSize } from "~/utils/formatters.js";

import { createProfileRowToggledEvent } from "./ProfileRow.events.js";
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
}

export const ProfileRow: FC<Props> = ({
  library,
  expanded,
  selected,
  selectedFilmId = null,
  scanning = false,
  scanProgress = null,
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
      ? `${totalItems} films`
      : data.mediaType === "TV_SHOWS"
        ? `${totalItems} episodes`
        : `${totalItems} items`;

  const handleRowClick = (e: MouseEvent): void => {
    e.stopPropagation();
    void bubble({ reactEvent: e, event: createProfileRowToggledEvent(data.id) });
  };

  return (
    <>
      <div
        className={mergeClasses(styles.row, selected && styles.rowSelected)}
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
          <div className={styles.path}>{data.path}</div>
        </div>

        <div className={styles.cell}>{typeLabel}</div>

        <div className={styles.cell}>
          {scanning ? (
            <div className={styles.scanInline}>
              <div className={styles.scanSpinner} />
              {scanProgress ? `${scanProgress.done}/${scanProgress.total}` : "…"}
            </div>
          ) : (
            <div className={styles.matchBar}>
              <div className={styles.matchTrack}>
                <div
                  className={mergeClasses(styles.matchFill, hasWarn && styles.matchFillWarn)}
                  style={{ width: `${matchPct}%` }}
                />
              </div>
              <span style={{ fontSize: 11, color: hasWarn ? "#F5C518" : "#666" }}>{matchPct}%</span>
            </div>
          )}
        </div>

        <div className={mergeClasses(styles.cell, "mono")}>
          {formatFileSize(data.stats.totalSizeBytes)}
        </div>

        <div
          className={mergeClasses(styles.actions, (hovered || selected) && styles.actionsVisible)}
        >
          {scanning ? (
            <span style={{ fontSize: 10, color: "#27AE60" }}>Scanning…</span>
          ) : (
            <>
              <button
                className={styles.iconBtn}
                onClick={(e) => e.stopPropagation()}
                title="Refresh"
              >
                <IconRefresh size={11} />
              </button>
              <button className={styles.iconBtn} onClick={(e) => e.stopPropagation()} title="Edit">
                <IconPencil size={11} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className={mergeClasses(styles.children, expanded && styles.childrenOpen)}>
        {data.videos.edges.map(({ node }) => (
          <FilmRow key={node.id} video={node} isSelected={node.id === selectedFilmId} />
        ))}
      </div>
    </>
  );
};
