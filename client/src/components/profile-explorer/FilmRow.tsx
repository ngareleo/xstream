import { mergeClasses } from "@griffel/react";
import { useNovaEventing } from "@nova/react";
import React, { type FC, type MouseEvent, useState } from "react";
import { graphql, useFragment } from "react-relay";
import { Link } from "react-router-dom";

import { IconDocument, IconEdit, IconPlay, IconTv, IconWarning } from "~/lib/icons.js";
import type { FilmRow_video$key } from "~/relay/__generated__/FilmRow_video.graphql.js";
import { formatDurationHuman, formatFileSize } from "~/utils/formatters.js";

import { createFilmSelectedEvent } from "./FilmRow.events.js";
import { strings } from "./FilmRow.strings.js";
import { useFilmRowStyles } from "./FilmRow.styles.js";

const FILM_FRAGMENT = graphql`
  fragment FilmRow_video on Video {
    id
    title
    filename
    durationSeconds
    fileSizeBytes
    matched
    mediaType
    metadata {
      title
      year
    }
    videoStream {
      height
      width
    }
  }
`;

interface Props {
  video: FilmRow_video$key;
  isSelected: boolean;
  paneOpen?: boolean;
}

export const FilmRow: FC<Props> = ({ video, isSelected, paneOpen = false }) => {
  const data = useFragment(FILM_FRAGMENT, video);
  const styles = useFilmRowStyles();
  const [hovered, setHovered] = useState(false);
  const { bubble } = useNovaEventing();

  const isUnmatched = !data.matched;
  const isTv = data.mediaType === "TV_SHOWS";
  const displayTitle = data.metadata?.title ?? data.title;
  const label = data.metadata?.year
    ? `${data.metadata.year} · ${formatDurationHuman(data.durationSeconds)}`
    : formatDurationHuman(data.durationSeconds);
  const isHd = (data.videoStream?.height ?? 0) >= 2160;

  const handleClick = (e: MouseEvent): void => {
    void bubble({ reactEvent: e, event: createFilmSelectedEvent(data.id) });
    e.stopPropagation();
  };

  const handleEditClick = (e: MouseEvent): void => {
    void bubble({ reactEvent: e, event: createFilmSelectedEvent(data.id) });
    e.stopPropagation();
  };

  return (
    <div
      className={mergeClasses(
        styles.row,
        paneOpen && styles.rowCompact,
        isSelected && styles.rowSelected
      )}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={styles.iconCol}>
        <div className={styles.treeLineEl} aria-hidden="true" />
        {isUnmatched ? (
          <IconWarning size={14} style={{ color: "rgba(245,197,24,0.5)" }} />
        ) : isTv ? (
          <IconTv size={14} />
        ) : (
          <IconDocument size={14} />
        )}
      </div>

      <div className={styles.nameCell}>
        <div className={mergeClasses(styles.name, isUnmatched && styles.nameUnmatched)}>
          {displayTitle}
        </div>
        <div className={styles.filename}>{data.filename}</div>
      </div>

      {!paneOpen && <div className={styles.cell}>{label}</div>}

      {!paneOpen && (
        <div className={styles.cell}>
          <span className={mergeClasses(styles.badge, isHd ? styles.badgeRed : styles.badgeGray)}>
            {isHd ? strings.badge4K : strings.badgeHD}
          </span>
        </div>
      )}

      <div className={mergeClasses(styles.cell, styles.cellMono)}>
        {formatFileSize(data.fileSizeBytes)}
      </div>

      <div
        className={mergeClasses(styles.actions, (hovered || isSelected) && styles.actionsVisible)}
      >
        <button
          className={styles.btnSurface}
          onClick={handleEditClick}
          title={strings.editLinkTitle}
        >
          <IconEdit size={11} />
        </button>
        {isUnmatched ? (
          <button
            className={mergeClasses(styles.btnSurface, styles.btnYellow)}
            onClick={handleEditClick}
          >
            {strings.link}
          </button>
        ) : (
          <Link
            to={`/player/${encodeURIComponent(data.id)}`}
            className={styles.btnRed}
            onClick={(e) => e.stopPropagation()}
          >
            <IconPlay size={10} />
          </Link>
        )}
      </div>
    </div>
  );
};
