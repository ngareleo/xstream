import { mergeClasses } from "@griffel/react";
import { type FC } from "react";
import { useSearchParams } from "react-router-dom";

import { DangerTab } from "~/components/danger-tab/DangerTab.js";
import { FlagsTabAsync } from "~/components/flags-tab/FlagsTabAsync.js";
import { LibraryTab } from "~/components/library-tab/LibraryTab.js";
import { MetadataTab } from "~/components/metadata-tab/MetadataTab.js";
import { TraceHistoryTabAsync } from "~/components/trace-history-tab/TraceHistoryTabAsync.js";
import { IS_DEV_BUILD } from "~/utils/devChunk.js";

import { strings } from "./SettingsPage.strings.js";
import { useSettingsStyles } from "./SettingsPage.styles.js";

const ALL_SECTIONS = ["library", "metadata", "flags", "trace", "danger"] as const;
type Section = (typeof ALL_SECTIONS)[number];

// Flags + Trace History are dev-only — drop the buttons from the prod nav.
const SECTIONS: readonly Section[] = IS_DEV_BUILD
  ? ALL_SECTIONS
  : ALL_SECTIONS.filter((s): s is Section => s !== "flags" && s !== "trace");

const SECTION_LABELS: Record<Section, string> = {
  library: strings.sectionLibrary,
  metadata: strings.sectionMetadata,
  flags: strings.sectionFlags,
  trace: strings.sectionTrace,
  danger: strings.sectionDanger,
};

function isSection(value: string | null): value is Section {
  return SECTIONS.includes(value as Section);
}

export const SettingsPageContent: FC = () => {
  const styles = useSettingsStyles();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawSection = searchParams.get("section");
  const active: Section = isSection(rawSection) ? rawSection : "library";

  const setActive = (next: Section): void => {
    setSearchParams({ section: next }, { replace: true });
  };

  return (
    <div className={styles.shell}>
      <nav className={styles.nav}>
        <div className={mergeClasses("eyebrow", styles.navHeading)}>{strings.eyebrow}</div>
        {SECTIONS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setActive(id)}
            className={mergeClasses(styles.navItem, active === id && styles.navItemActive)}
          >
            {SECTION_LABELS[id]}
          </button>
        ))}
      </nav>

      <div className={styles.body}>
        <div className={mergeClasses("eyebrow", styles.sectionEyebrow)}>
          · {SECTION_LABELS[active].toUpperCase()}
        </div>
        <div className={styles.sectionTitle}>{SECTION_LABELS[active]}</div>
        <div className={styles.sectionWrap}>
          {active === "library" && <LibraryTab />}
          {active === "metadata" && <MetadataTab />}
          {active === "flags" && <FlagsTabAsync />}
          {active === "trace" && <TraceHistoryTabAsync />}
          {active === "danger" && <DangerTab />}
        </div>
      </div>
    </div>
  );
};
