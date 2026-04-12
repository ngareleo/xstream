import { type FC } from "react";
import { graphql, useFragment } from "react-relay";

import { Slideshow } from "~/components/slideshow/Slideshow.js";
import type { DashboardHero_library$key } from "~/relay/__generated__/DashboardHero_library.graphql.js";
import { formatFileSize } from "~/utils/formatters.js";

import { strings } from "./DashboardHero.strings.js";
import { useDashboardHeroStyles } from "./DashboardHero.styles.js";

const FRAGMENT = graphql`
  fragment DashboardHero_library on Library @relay(plural: true) {
    stats {
      totalCount
      totalSizeBytes
    }
  }
`;

interface Props {
  libraries: DashboardHero_library$key;
}

export const DashboardHero: FC<Props> = ({ libraries }) => {
  const data = useFragment(FRAGMENT, libraries);
  const styles = useDashboardHeroStyles();

  const totalFiles = data.reduce((s, l) => s + l.stats.totalCount, 0);
  const totalBytes = data.reduce((s, l) => s + l.stats.totalSizeBytes, 0);

  return (
    <div className={styles.hero}>
      <Slideshow />
      <div className={styles.greeting}>
        <div className={styles.greetingText}>
          {strings.greetingPrefix}{" "}
          <span className={styles.greetingName}>{strings.greetingHighlight}</span>
        </div>
        <div className={styles.greetingSub}>
          {totalFiles} files · {formatFileSize(totalBytes)}
        </div>
      </div>
    </div>
  );
};
