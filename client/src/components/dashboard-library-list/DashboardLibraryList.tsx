import { type FC } from "react";
import { graphql, useFragment } from "react-relay";

import { ProfileRow } from "~/components/profile-row/ProfileRow.js";
import type { DashboardLibraryList_library$key } from "~/relay/__generated__/DashboardLibraryList_library.graphql.js";
import { formatFileSize } from "~/utils/formatters.js";

import { strings } from "./DashboardLibraryList.strings.js";
import { useDashboardLibraryListStyles } from "./DashboardLibraryList.styles.js";

const FRAGMENT = graphql`
  fragment DashboardLibraryList_library on Library @relay(plural: true) {
    id
    stats {
      totalCount
      totalSizeBytes
    }
    ...ProfileRow_library
  }
`;

interface Props {
  libraries: DashboardLibraryList_library$key;
  expandedId: string | null;
  isPaneFilmDetail: boolean;
  isPaneOpen: boolean;
  selectedFilmId: string | null;
}

export const DashboardLibraryList: FC<Props> = ({
  libraries,
  expandedId,
  isPaneFilmDetail,
  isPaneOpen,
  selectedFilmId,
}) => {
  const data = useFragment(FRAGMENT, libraries);
  const styles = useDashboardLibraryListStyles();

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
        <span className={styles.locCurrent}>{strings.breadcrumbCurrent}</span>
      </div>

      {/* Column headers */}
      <div className={styles.dirHeader}>
        <div />
        <div className={styles.dirCol}>{strings.colName}</div>
        <div className={styles.dirCol}>{strings.colCount}</div>
        <div className={styles.dirCol}>{strings.colMatch}</div>
        <div className={styles.dirCol}>{strings.colSize}</div>
        <div className={styles.dirCol}>{strings.colActions}</div>
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
