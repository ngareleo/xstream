import { type FC, useState } from "react";
import { graphql, useMutation } from "react-relay";

import type { LibraryTabScanMutation } from "~/relay/__generated__/LibraryTabScanMutation.graphql.js";

import { strings } from "./LibraryTab.strings.js";
import { useSettingsTabStyles } from "./SettingsTabs.styles.js";

const SCAN_MUTATION = graphql`
  mutation LibraryTabScanMutation {
    scanLibraries {
      id
    }
  }
`;

export const LibraryTab: FC = () => {
  const styles = useSettingsTabStyles();
  const [scan, isPending] = useMutation<LibraryTabScanMutation>(SCAN_MUTATION);
  const [done, setDone] = useState(false);

  const handleScan = (): void => {
    setDone(false);
    scan({ variables: {}, onCompleted: () => setDone(true) });
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{strings.sectionTitle}</div>
      <div className={styles.sectionDesc}>{strings.sectionDesc}</div>
      <button className={styles.btn} onClick={handleScan} disabled={isPending} type="button">
        {isPending ? strings.scanningBtn : strings.scanBtn}
      </button>
      {done && <div className={styles.successMsg}>{strings.successMsg}</div>}
    </div>
  );
};
