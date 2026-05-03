import { mergeClasses } from "@griffel/react";
import { type FC, type ReactNode } from "react";

import { formatFileSize } from "~/utils/formatters";

import { strings } from "./FilmVariants.strings";
import { useFilmVariantsStyles } from "./FilmVariants.styles";

export interface FilmVariantOption {
  /** Video id of this copy. The play CTA navigates to `/player/<id>`. */
  id: string;
  /** "4K", "1080p", "720p", … */
  resolution: string | null;
  /** "HEVC", "AVC", … */
  codec: string | null;
  /** File size in bytes; rendered via `formatFileSize`. */
  fileSizeBytes: number;
  /** Library / profile name where this copy lives. */
  libraryName: string | null;
}

export interface FilmVariantsProps {
  copies: ReadonlyArray<FilmVariantOption>;
  /** Currently-selected variant id. Caller threads this through play CTA. */
  selectedId: string;
  onSelect: (id: string) => void;
}

/**
 * Variant picker rendered inside FilmDetailsOverlay when a Film has more
 * than one main copy. Single-select. Hidden by the caller when
 * `copies.length === 1`.
 */
export const FilmVariants: FC<FilmVariantsProps> = ({ copies, selectedId, onSelect }) => {
  const styles = useFilmVariantsStyles();
  if (copies.length <= 1) return null;

  return (
    <div className={styles.root} role="radiogroup" aria-label={strings.ariaLabel}>
      <div className={styles.heading}>{strings.heading}</div>
      <div className={styles.list}>
        {copies.map((copy) => {
          const selected = copy.id === selectedId;
          const tokens: ReactNode[] = [];
          if (copy.resolution) tokens.push(<span key="res">{copy.resolution}</span>);
          if (copy.codec) tokens.push(<span key="cod">{copy.codec}</span>);
          tokens.push(<span key="size">{formatFileSize(copy.fileSizeBytes)}</span>);
          if (copy.libraryName) tokens.push(<span key="lib">{copy.libraryName}</span>);
          return (
            <button
              key={copy.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(copy.id)}
              className={mergeClasses(styles.row, selected && styles.rowSelected)}
            >
              <span className={styles.dot} aria-hidden="true" />
              <span className={styles.tokens}>
                {tokens.map((t, i) => (
                  <span key={i} className={styles.token}>
                    {t}
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
