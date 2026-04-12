import { mergeClasses } from "@griffel/react";
import { type FC } from "react";

import { IconBars, IconSquares } from "~/lib/icons.js";

import { strings } from "./LibraryFilterBar.strings.js";
import { useLibraryFilterBarStyles } from "./LibraryFilterBar.styles.js";

export type TypeFilter = "all" | "MOVIES" | "TV_SHOWS";

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  typeFilter: TypeFilter;
  onTypeFilterChange: (value: TypeFilter) => void;
  isGrid: boolean;
  onIsGridChange: (value: boolean) => void;
  count: number;
}

export const LibraryFilterBar: FC<Props> = ({
  search,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  isGrid,
  onIsGridChange,
  count,
}) => {
  const styles = useLibraryFilterBarStyles();

  return (
    <div className={styles.filterBar}>
      <input
        className={styles.searchInput}
        placeholder={strings.searchPlaceholder}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <div className={styles.filterSep} />
      <select
        className={styles.filterSelect}
        value={typeFilter}
        onChange={(e) => onTypeFilterChange(e.target.value as TypeFilter)}
      >
        <option value="all">{strings.filterAll}</option>
        <option value="MOVIES">{strings.filterMovies}</option>
        <option value="TV_SHOWS">{strings.filterTvShows}</option>
      </select>
      <div className={styles.filterSep} />
      <button
        className={mergeClasses(styles.toggleBtn, isGrid && styles.toggleBtnActive)}
        onClick={() => onIsGridChange(true)}
        title={strings.gridViewTitle}
        type="button"
      >
        <IconSquares size={13} />
      </button>
      <button
        className={mergeClasses(styles.toggleBtn, !isGrid && styles.toggleBtnActive)}
        onClick={() => onIsGridChange(false)}
        title={strings.listViewTitle}
        type="button"
      >
        <IconBars size={13} />
      </button>
      <span className={styles.filterCount}>
        {count} {count !== 1 ? strings.titlePlural : strings.titleSingular}
      </span>
    </div>
  );
};
