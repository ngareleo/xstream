import { mergeClasses } from "@griffel/react";
import type { FC } from "react";

import { IconFilm, IconTv } from "~/lib/icons";

import { strings } from "./MediaKindBadge.strings";
import { useMediaKindBadgeStyles } from "./MediaKindBadge.styles";

export type MediaKind = "MOVIES" | "TV_SHOWS" | "%future added value";

interface MediaKindBadgeProps {
  kind: MediaKind;
  variant?: "tile" | "row";
}

export const MediaKindBadge: FC<MediaKindBadgeProps> = ({ kind, variant = "row" }) => {
  const styles = useMediaKindBadgeStyles();
  const isSeries = kind === "TV_SHOWS";
  const label = isSeries ? strings.labelSeries : strings.labelMovie;
  const ariaProps =
    variant === "tile"
      ? { "aria-label": label, title: label }
      : { "aria-hidden": true as const, title: label };

  return (
    <span
      className={mergeClasses(
        styles.base,
        variant === "tile" && styles.tile,
        variant === "tile" && isSeries && styles.tileSeries,
        variant === "row" && styles.row,
        variant === "row" && isSeries && styles.rowSeries
      )}
      {...ariaProps}
    >
      {isSeries ? <IconTv size={12} /> : <IconFilm size={12} />}
    </span>
  );
};
