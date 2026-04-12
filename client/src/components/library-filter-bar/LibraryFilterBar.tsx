import { mergeClasses } from "@griffel/react";
import { type FC } from "react";

import { IconBars, IconSquares } from "~/lib/icons.js";

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
        placeholder="Search titles, genres…"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <div className={styles.filterSep} />
      <select
        className={styles.filterSelect}
        value={typeFilter}
        onChange={(e) => onTypeFilterChange(e.target.value as TypeFilter)}
      >
        <option value="all">All Types</option>
        <option value="MOVIES">Movies</option>
        <option value="TV_SHOWS">TV Shows</option>
      </select>
      <div className={styles.filterSep} />
      <button
        className={mergeClasses(styles.toggleBtn, isGrid && styles.toggleBtnActive)}
        onClick={() => onIsGridChange(true)}
        title="Grid view"
        type="button"
      >
        <IconSquares size={13} />
      </button>
      <button
        className={mergeClasses(styles.toggleBtn, !isGrid && styles.toggleBtnActive)}
        onClick={() => onIsGridChange(false)}
        title="List view"
        type="button"
      >
        <IconBars size={13} />
      </button>
      <span className={styles.filterCount}>
        {count} title{count !== 1 ? "s" : ""}
      </span>
    </div>
  );
};
