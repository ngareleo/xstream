import { mergeClasses } from "@griffel/react";
import { type FC, type ReactNode } from "react";

import {
  CODECS,
  DECADES,
  type Filters,
  filtersActive,
  HDRS,
  RESOLUTIONS,
  toggleSetItem,
} from "~/utils/filters";

import { strings } from "./FilterSlide.strings";
import { useFilterSlideStyles } from "./FilterSlide.styles";

interface FilterSlideProps {
  query: string;
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  resultCount: number;
  totalMatched: number;
  profileCount: number;
  onClose: () => void;
  onClearFilters: () => void;
}

export const FilterSlide: FC<FilterSlideProps> = ({
  query,
  filters,
  setFilters,
  resultCount,
  totalMatched,
  profileCount,
  onClose,
  onClearFilters,
}) => {
  const styles = useFilterSlideStyles();
  const hasQuery = query.trim().length > 0;
  const active = filtersActive(filters);

  return (
    <div className={styles.panel}>
      <div className={styles.eyebrow}>
        · {strings.eyebrow}
        {hasQuery && <> · {query.trim()}</>} ·{" "}
        <span className={styles.eyebrowAccent}>
          {totalMatched} → {resultCount}
        </span>
      </div>

      <div className={styles.table}>
        <FilterRow label={strings.dimResolution}>
          {RESOLUTIONS.map((r) => (
            <TuiToggle
              key={r}
              checked={filters.resolutions.has(r)}
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  resolutions: toggleSetItem(f.resolutions, r),
                }))
              }
              label={r}
            />
          ))}
        </FilterRow>

        <FilterRow label={strings.dimHdr}>
          {HDRS.map((h) => (
            <TuiToggle
              key={h}
              checked={filters.hdrs.has(h)}
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  hdrs: toggleSetItem(f.hdrs, h),
                }))
              }
              label={h === "—" ? strings.sdrLabel : h}
            />
          ))}
        </FilterRow>

        <FilterRow label={strings.dimCodec}>
          {CODECS.map((c) => (
            <TuiToggle
              key={c}
              checked={filters.codecs.has(c)}
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  codecs: toggleSetItem(f.codecs, c),
                }))
              }
              label={c}
            />
          ))}
        </FilterRow>

        <FilterRow label={strings.dimDecade}>
          {DECADES.map((d) => (
            <TuiToggle
              key={d.decade}
              checked={filters.decades.has(d.decade)}
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  decades: toggleSetItem(f.decades, d.decade),
                }))
              }
              label={d.label}
            />
          ))}
        </FilterRow>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onClose}>
          {strings.actionDone}
        </button>
        <button
          type="button"
          className={styles.secondary}
          onClick={onClearFilters}
          disabled={active === 0}
          aria-disabled={active === 0}
        >
          {strings.actionClear}
        </button>
        <span className={styles.hint}>
          {profileCount} libraries · {totalMatched} matches before filters
        </span>
      </div>
    </div>
  );
};

const FilterRow: FC<{ label: string; children: ReactNode }> = ({ label, children }) => {
  const styles = useFilterSlideStyles();
  return (
    <div className={styles.row}>
      <div className={styles.rowLabel}>{label}</div>
      <div className={styles.rowOptions}>{children}</div>
    </div>
  );
};

const TuiToggle: FC<{
  label: string;
  checked: boolean;
  onClick: () => void;
}> = ({ label, checked, onClick }) => {
  const styles = useFilterSlideStyles();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      className={mergeClasses(styles.toggle, checked && styles.toggleOn)}
    >
      <span className={styles.toggleBox}>{checked ? "[x]" : "[ ]"}</span>
      <span>{label}</span>
    </button>
  );
};
