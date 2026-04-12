import { type FC } from "react";

import { strings } from "./DangerTab.strings.js";
import { useSettingsTabStyles } from "./SettingsTabs.styles.js";

export const DangerTab: FC = () => {
  const styles = useSettingsTabStyles();
  return (
    <div className={styles.section}>
      <div className={styles.dangerZone}>
        <div className={styles.dangerTitle}>{strings.dangerTitle}</div>
        <div className={styles.dangerDesc}>{strings.dangerDesc}</div>
        <button className={styles.btnDanger} disabled type="button">
          {strings.deleteBtn}
        </button>
      </div>
    </div>
  );
};
