import { type FC } from "react";
import { graphql, useFragment } from "react-relay";

import { ProfileRow } from "~/components/profile-row/ProfileRow.js";
import type { DashboardLibraryList_library$key } from "~/relay/__generated__/DashboardLibraryList_library.graphql.js";
import { formatFileSize } from "~/utils/formatters.js";

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
  selectedFilmId: string | null;
}

export const DashboardLibraryList: FC<Props> = ({
  libraries,
  expandedId,
  isPaneFilmDetail,
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
          Profiles
        </span>
        <span className={styles.locSep}>/</span>
        <span className={styles.locCurrent}>All Libraries</span>
      </div>

      {/* Column headers */}
      <div className={styles.dirHeader}>
        <div />
        <div className={styles.dirCol}>Name</div>
        <div className={styles.dirCol}>Count</div>
        <div className={styles.dirCol}>Match</div>
        <div className={styles.dirCol}>Size</div>
        <div className={styles.dirCol}>Actions</div>
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
          />
        ))}
      </div>

      {/* Footer */}
      <div className={styles.dirFooter}>
        <span className={styles.dirFooterStat}>
          Libraries <span className={styles.dirFooterStatNum}>{data.length}</span>
        </span>
        <span className={styles.dirFooterStat}>
          Files <span className={styles.dirFooterStatNum}>{totalFiles}</span>
        </span>
        <span className={styles.dirFooterStat}>
          Total <span className={styles.dirFooterStatNum}>{formatFileSize(totalBytes)}</span>
        </span>
      </div>
    </>
  );
};
