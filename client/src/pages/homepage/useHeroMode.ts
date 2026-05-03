import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { applyFilters, EMPTY_FILTERS, type Filters, filtersActive } from "~/utils/filters";

import { type FilterRow } from "./HomePageContent.utils";

export type HeroMode = "idle" | "searching" | "filtering";

export interface HeroModeApi {
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  searchFocused: boolean;
  setSearchFocused: Dispatch<SetStateAction<boolean>>;
  filterOpen: boolean;
  setFilterOpen: Dispatch<SetStateAction<boolean>>;
  filters: Filters;
  setFilters: Dispatch<SetStateAction<Filters>>;
  heroMode: HeroMode;
  hasQuery: boolean;
  showFlatResults: boolean;
  activeFilterCount: number;
  queryMatched: FilterRow[];
  searchResults: FilterRow[];
  clearAll: () => void;
}

/**
 * Owns the search/filter visibility cluster on the homepage hero: search
 * input, filter slide, and the derived `heroMode` that picks which slide
 * is showing. Also owns the Escape-to-close keyboard shortcut so the
 * page component stays focused on layout.
 */
export const useHeroMode = (rows: FilterRow[], paused: boolean): HeroModeApi => {
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const trimmedQuery = search.trim().toLowerCase();
  const hasQuery = trimmedQuery.length > 0;
  const activeFilterCount = filtersActive(filters);
  const showFlatResults = hasQuery || activeFilterCount > 0;
  const heroMode: HeroMode = filterOpen
    ? "filtering"
    : searchFocused || showFlatResults
      ? "searching"
      : "idle";

  const queryMatched = useMemo<FilterRow[]>(() => {
    if (!trimmedQuery) return rows;
    return rows.filter(
      (r) =>
        r.title.includes(trimmedQuery) ||
        r.filename.includes(trimmedQuery) ||
        r.director.includes(trimmedQuery) ||
        r.genre.includes(trimmedQuery)
    );
  }, [rows, trimmedQuery]);

  const searchResults = useMemo<FilterRow[]>(
    () => applyFilters(queryMatched, filters),
    [queryMatched, filters]
  );

  const clearAll = useCallback((): void => {
    setSearch("");
    setFilters(EMPTY_FILTERS);
    setFilterOpen(false);
    setSearchFocused(false);
  }, []);

  useEffect(() => {
    if (paused || heroMode === "idle") return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      if (filterOpen) setFilterOpen(false);
      else clearAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paused, heroMode, filterOpen, clearAll]);

  return {
    search,
    setSearch,
    searchFocused,
    setSearchFocused,
    filterOpen,
    setFilterOpen,
    filters,
    setFilters,
    heroMode,
    hasQuery,
    showFlatResults,
    activeFilterCount,
    queryMatched,
    searchResults,
    clearAll,
  };
};
