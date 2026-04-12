import { mergeClasses } from "@griffel/react";
import { type FC, type MouseEvent } from "react";
import { graphql, useFragment } from "react-relay";

import type { ProfileExplorer_library$key } from "~/relay/__generated__/ProfileExplorer_library.graphql.js";
import { formatFileSize } from "~/utils/formatters.js";

import { strings } from "./ProfileExplorer.strings.js";
import { useProfileExplorerStyles } from "./ProfileExplorer.styles.js";
import { ProfileRow } from "./ProfileRow.js";

const FRAGMENT = graphql`
  fragment ProfileExplorer_library on Library @relay(plural: true) {
    id
    stats {
      totalCount
      totalSizeBytes
    }
    ...ProfileRow_library
  }
`;

interface Props {
  libraries: ProfileExplorer_library$key;
  expandedId: string | null;
  isPaneFilmDetail: boolean;
  isPaneOpen: boolean;
  selectedFilmId: string | null;
  scanningLibraryId?: string | null;
  scanProgress?: { done: number; total: number } | null;
  activeProfileName?: string | null;
  onClearProfile?: (e: MouseEvent) => void;
}

export const ProfileExplorer: FC<Props> = ({
  libraries,
  expandedId,
  isPaneFilmDetail,
  isPaneOpen,
  selectedFilmId,
  scanningLibraryId = null,
  scanProgress = null,
  activeProfileName = null,
  onClearProfile,
}) => {
  const data = useFragment(FRAGMENT, libraries);
  const styles = useProfileExplorerStyles();

  const totalFiles = data.reduce((s, l) => s + l.stats.totalCount, 0);
  const totalBytes = data.reduce((s, l) => s + l.stats.totalSizeBytes, 0);

  return (
    <>
      {/* Location bar */}
      <div className={styles.locationBar}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em" }}>
          {strings.breadcrumbRoot}
        </span>
        <span className={styles.locSep}>{strings.breadcrumbSep}</span>
        {activeProfileName ? (
          <span className={styles.locPill}>
            {activeProfileName}
            <button
              className={styles.locPillX}
              onClick={onClearProfile}
              type="button"
              aria-label="Clear profile filter"
            >
              ×
            </button>
          </span>
        ) : (
          <span className={styles.locCurrent}>{strings.breadcrumbCurrent}</span>
        )}
      </div>

      {/* Column headers */}
      <div className={mergeClasses(styles.dirHeader, isPaneOpen && styles.dirHeaderCompact)}>
        <div />
        <div className={styles.dirCol}>{strings.colName}</div>
        {!isPaneOpen && <div className={styles.dirCol}>{strings.colCount}</div>}
        {!isPaneOpen && <div className={styles.dirCol}>{strings.colMatch}</div>}
        {!isPaneOpen && <div className={styles.dirCol}>{strings.colSize}</div>}
        <div />
      </div>

      {/* Library rows */}
      <div className={styles.dirList}>
        {data.map((lib) => (
          <ProfileRow
            key={lib.id}
            library={lib}
            expanded={expandedId === lib.id}
            selected={isPaneFilmDetail}
            selectedFilmId={selectedFilmId}
            isPaneOpen={isPaneOpen}
            scanning={scanningLibraryId === lib.id}
            scanProgress={scanningLibraryId === lib.id ? scanProgress : null}
          />
        ))}
      </div>

      {/* Footer */}
      <div className={styles.dirFooter}>
        <span className={styles.dirFooterStat}>
          {strings.footerLibraries} <span className={styles.dirFooterStatNum}>{data.length}</span>
        </span>
        <span className={styles.dirFooterStat}>
          {strings.footerFiles} <span className={styles.dirFooterStatNum}>{totalFiles}</span>
        </span>
        <span className={styles.dirFooterStat}>
          {strings.footerTotal}{" "}
          <span className={styles.dirFooterStatNum}>{formatFileSize(totalBytes)}</span>
        </span>
      </div>
    </>
  );
};
