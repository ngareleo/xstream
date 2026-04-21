import { mergeClasses } from "@griffel/react";
import { type FC } from "react";
import { graphql, useLazyLoadQuery } from "react-relay";
import { useSearchParams } from "react-router-dom";

import { DangerTab } from "~/components/danger-tab/DangerTab.js";
import { FlagsTab } from "~/components/flags-tab/FlagsTab.js";
import { LibraryTab } from "~/components/library-tab/LibraryTab.js";
import { MetadataTab } from "~/components/metadata-tab/MetadataTab.js";
import { TraceHistoryTab } from "~/components/trace-history-tab/TraceHistoryTab.js";
import type { SettingsPageContentQuery } from "~/relay/__generated__/SettingsPageContentQuery.graphql.js";

import { strings } from "./SettingsPage.strings.js";
import { useSettingsStyles } from "./SettingsPage.styles.js";

const SETTINGS_QUERY = graphql`
  query SettingsPageContentQuery {
    ...TraceHistoryTab_sessions
  }
`;

const TABS = ["library", "metadata", "flags", "trace", "danger"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  library: strings.tabLibrary,
  metadata: strings.tabMetadata,
  flags: strings.tabFlags,
  trace: strings.tabTrace,
  danger: strings.tabDanger,
};

function isValidTab(value: string | null): value is Tab {
  return TABS.includes(value as Tab);
}

export const SettingsPageContent: FC = () => {
  const styles = useSettingsStyles();
  const [searchParams, setSearchParams] = useSearchParams();
  const data = useLazyLoadQuery<SettingsPageContentQuery>(
    SETTINGS_QUERY,
    {},
    {
      fetchPolicy: "store-and-network",
    }
  );

  const rawTab = searchParams.get("tab");
  const activeTab: Tab = isValidTab(rawTab) ? rawTab : "library";

  const selectTab = (t: Tab): void => {
    setSearchParams({ tab: t }, { replace: true });
  };

  return (
    <div className={styles.root}>
      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t}
            className={mergeClasses(styles.tab, activeTab === t && styles.tabActive)}
            onClick={() => selectTab(t)}
            type="button"
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      <div className={styles.body}>
        {activeTab === "library" && <LibraryTab />}
        {activeTab === "metadata" && <MetadataTab />}
        {activeTab === "flags" && <FlagsTab />}
        {activeTab === "trace" && <TraceHistoryTab query={data} />}
        {activeTab === "danger" && <DangerTab />}
      </div>
    </div>
  );
};
