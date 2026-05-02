import { type FC, type ReactNode } from "react";
import { mergeClasses } from "@griffel/react";
import { profiles } from "../../data/mock.js";
import {
  CODECS,
  DECADES,
  type Filters,
  filtersActive,
  HDRS,
  RESOLUTIONS,
  toggleSetItem,
} from "./filters.js";
import { useFilterSlideStyles } from "./FilterSlide.styles.js";

interface FilterSlideProps {
  query: string;
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  resultCount: number;
  totalMatched: number;
  onClose: () => void;
  onClearFilters: () => void;
}

/**
 * Hero panel shown when filter mode is active. TUI-styled table with
 * `[ ]` / `[x]` toggleable text chips for resolution, HDR, codec and
 * decade. Footer carries the [↩] Done + [⇧⌫] Clear text actions.
 */
export const FilterSlide: FC<FilterSlideProps> = ({
  query,
  filters,
  setFilters,
  resultCount,
  totalMatched,
  onClose,
  onClearFilters,
}) => {
  const s = useFilterSlideStyles();
  const hasQuery = query.trim().length > 0;
  const active = filtersActive(filters);

  return (
    <div className={s.panel}>
      <div className={s.eyebrow}>
        · filters
        {hasQuery && <> · {query.trim()}</>}
        {" "}
        ·{" "}
        <span className={s.eyebrowAccent}>
          {totalMatched} → {resultCount}
        </span>
      </div>

      <div className={s.table}>
        <FilterRow label="resolution">
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

        <FilterRow label="hdr">
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
              label={h === "—" ? "SDR" : h}
            />
          ))}
        </FilterRow>

        <FilterRow label="codec">
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

        <FilterRow label="decade">
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

      <div className={s.actions}>
        <button type="button" className={s.primary} onClick={onClose}>
          [↩] Done
        </button>
        <button
          type="button"
          className={s.secondary}
          onClick={onClearFilters}
          disabled={active === 0}
          aria-disabled={active === 0}
        >
          [⇧⌫] Clear
        </button>
        <span className={s.hint}>
          {profiles.length} libraries · {totalMatched} matches before filters
        </span>
      </div>
    </div>
  );
};

const FilterRow: FC<{ label: string; children: ReactNode }> = ({
  label,
  children,
}) => {
  const s = useFilterSlideStyles();
  return (
    <div className={s.row}>
      <div className={s.rowLabel}>{label}</div>
      <div className={s.rowOptions}>{children}</div>
    </div>
  );
};

const TuiToggle: FC<{
  label: string;
  checked: boolean;
  onClick: () => void;
}> = ({ label, checked, onClick }) => {
  const s = useFilterSlideStyles();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      className={mergeClasses(s.toggle, checked && s.toggleOn)}
    >
      <span className={s.toggleBox}>{checked ? "[x]" : "[ ]"}</span>
      <span>{label}</span>
    </button>
  );
};
