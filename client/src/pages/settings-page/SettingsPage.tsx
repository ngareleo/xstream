import { mergeClasses } from "@griffel/react";
import { type FC, useState } from "react";

import { DangerTab } from "~/components/settings-tabs/DangerTab.js";
import { LibraryTab } from "~/components/settings-tabs/LibraryTab.js";
import { MetadataTab } from "~/components/settings-tabs/MetadataTab.js";

import { strings } from "./SettingsPage.strings.js";
import { useSettingsStyles } from "./SettingsPage.styles.js";

type Tab = "library" | "metadata" | "danger";

export const SettingsPage: FC = () => {
  const styles = useSettingsStyles();
  const [activeTab, setActiveTab] = useState<Tab>("library");

  return (
    <div className={styles.root}>
      <div className={styles.tabs}>
        {(["library", "metadata", "danger"] as Tab[]).map((t) => (
          <button
            key={t}
            className={mergeClasses(styles.tab, activeTab === t && styles.tabActive)}
            onClick={() => setActiveTab(t)}
            type="button"
          >
            {t === "library"
              ? strings.tabLibrary
              : t === "metadata"
                ? strings.tabMetadata
                : strings.tabDanger}
          </button>
        ))}
      </div>
      <div className={styles.body}>
        {activeTab === "library" && <LibraryTab />}
        {activeTab === "metadata" && <MetadataTab />}
        {activeTab === "danger" && <DangerTab />}
      </div>
    </div>
  );
};
