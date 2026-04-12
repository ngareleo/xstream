import { mergeClasses } from "@griffel/react";
import { type FC } from "react";
import { graphql, useFragment } from "react-relay";

import type { LibraryChips_library$key } from "~/relay/__generated__/LibraryChips_library.graphql.js";

import { strings } from "./LibraryChips.strings.js";
import { useLibraryChipsStyles } from "./LibraryChips.styles.js";

const FRAGMENT = graphql`
  fragment LibraryChips_library on Library
  @relay(plural: true)
  @argumentDefinitions(search: { type: "String" }, mediaType: { type: "MediaType" }) {
    id
    name
    videos(first: 200, search: $search, mediaType: $mediaType) {
      totalCount
    }
  }
`;

interface Props {
  libraries: LibraryChips_library$key;
  activeLibraryId: string | null;
  onActiveLibraryIdChange: (id: string | null) => void;
}

export const LibraryChips: FC<Props> = ({
  libraries,
  activeLibraryId,
  onActiveLibraryIdChange,
}) => {
  const data = useFragment(FRAGMENT, libraries);
  const styles = useLibraryChipsStyles();

  const totalCount = data.reduce((s, l) => s + l.videos.totalCount, 0);

  return (
    <div className={styles.root}>
      <button
        className={mergeClasses(styles.chip, activeLibraryId === null && styles.chipActive)}
        onClick={() => onActiveLibraryIdChange(null)}
        type="button"
      >
        {strings.allChipLabel}
        <span className={styles.chipCount}>{totalCount}</span>
      </button>
      {data.map((lib) => (
        <button
          key={lib.id}
          className={mergeClasses(styles.chip, lib.id === activeLibraryId && styles.chipActive)}
          onClick={() => onActiveLibraryIdChange(lib.id === activeLibraryId ? null : lib.id)}
          type="button"
        >
          {lib.name}
          <span className={styles.chipCount}>{lib.videos.totalCount}</span>
        </button>
      ))}
    </div>
  );
};
