import { mergeClasses } from "@griffel/react";
import { type FC, type ReactNode } from "react";
import { graphql, useFragment } from "react-relay";
import { Link } from "react-router-dom";

import { IconChevron } from "~/lib/icons.js";
import type { ProfileRow_library$key } from "~/relay/__generated__/ProfileRow_library.graphql.js";
import { formatFileSize } from "~/utils/formatters.js";

import { strings } from "./ProfileRow.strings.js";
import { useProfileRowStyles } from "./ProfileRow.styles.js";

const LIBRARY_FRAGMENT = graphql`
  fragment ProfileRow_library on Library {
    id
    name
    path
    status
    lastSeenAt
    stats {
      totalCount
      matchedCount
      unmatchedCount
      totalSizeBytes
    }
  }
`;

interface ProfileRowProps {
  library: ProfileRow_library$key;
  expanded: boolean;
  onToggle: () => void;
  /** Films rendered as the expanded body — pass <FilmRow> children. */
  children?: ReactNode;
  scanning?: boolean;
  scanProgress?: { done: number; total: number } | null;
  /** Live reachability from the availability subscription; overrides the
   *  status baked into the query fragment so the pill reflects flips
   *  without re-querying the library list. */
  statusOverride?: "ONLINE" | "OFFLINE" | "UNKNOWN" | null;
  lastSeenOverride?: string | null;
}

export const ProfileRow: FC<ProfileRowProps> = ({
  library,
  expanded,
  onToggle,
  children,
  scanning = false,
  scanProgress = null,
  statusOverride = null,
  lastSeenOverride = null,
}) => {
  const data = useFragment(LIBRARY_FRAGMENT, library);
  const styles = useProfileRowStyles();
  const status = statusOverride ?? data.status;
  const lastSeenAt = lastSeenOverride ?? data.lastSeenAt;
  const total = data.stats.totalCount;
  const matched = data.stats.matchedCount;
  const unmatched = data.stats.unmatchedCount;
  const matchPct = total > 0 ? (matched / total) * 100 : 0;
  const warn = unmatched > 0;
  const hasFilms = Boolean(children);

  return (
    <div className={styles.block}>
      <div
        onClick={onToggle}
        className={mergeClasses(styles.header, expanded && styles.headerExpanded)}
      >
        <span className={mergeClasses(styles.chevron, expanded && styles.chevronOpen)}>
          <IconChevron />
        </span>
        <div>
          <div className={styles.name}>{data.name}</div>
          <div className={styles.path}>
            {data.path}
            <span
              className={mergeClasses(
                styles.statusPill,
                status === "ONLINE"
                  ? styles.statusOnline
                  : status === "OFFLINE"
                    ? styles.statusOffline
                    : styles.statusUnknown
              )}
              title={lastSeenAt ? `last seen ${lastSeenAt}` : "not yet probed"}
            >
              {status === "ONLINE" ? "● online" : status === "OFFLINE" ? "○ offline" : "○ unknown"}
            </span>
          </div>
        </div>

        <div>
          {scanning ? (
            <div className={styles.scanRow}>
              <div className={styles.scanSpinner} aria-hidden="true" />
              {scanProgress
                ? strings.formatString(strings.scanningProgressFormat, scanProgress)
                : null}
            </div>
          ) : (
            <div className={styles.matchRow}>
              <div className={styles.matchTrack}>
                <div
                  className={mergeClasses(styles.matchFill, warn && styles.matchFillWarn)}
                  style={{ width: `${matchPct}%` }}
                />
              </div>
              <span className={mergeClasses(styles.matchPct, warn && styles.matchPctWarn)}>
                {Math.round(matchPct)}%
              </span>
            </div>
          )}
        </div>

        <div className={styles.size}>{formatFileSize(data.stats.totalSizeBytes)}</div>
        <div className={styles.rowEnd}>
          {scanning ? (
            strings.scanning
          ) : (
            <Link
              to={`/profiles/${encodeURIComponent(data.id)}/edit`}
              onClick={(e) => e.stopPropagation()}
              className={styles.editLink}
            >
              {strings.edit}
            </Link>
          )}
        </div>
      </div>

      {expanded && hasFilms && <div className={styles.filmsList}>{children}</div>}
    </div>
  );
};
