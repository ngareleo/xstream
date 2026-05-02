import { type FC } from "react";
import { mergeClasses } from "@griffel/react";
import { type MediaKind } from "../../data/mock.js";
import { IconFilm, IconTv } from "../../lib/icons.js";
import { useMediaKindBadgeStyles } from "./MediaKindBadge.styles.js";

interface MediaKindBadgeProps {
  kind: MediaKind;
  /**
   * `tile` — absolute-positioned corner badge with a blurred backdrop +
   * border, designed to float on top of a poster (FilmTile).
   *
   * `row` — inline glyph that sits in flow next to a title, no chrome
   * (FilmRow). Defaults to `row`.
   */
  variant?: "tile" | "row";
}

/**
 * Movie / TV-series discriminator. The icon swaps with `kind`
 * (film-reel for movies, TV monitor for series); series additionally
 * pick up the green accent so the discriminator reads at a glance.
 *
 * Two visual variants share the same kind→icon mapping but differ in
 * geometry — see the `variant` prop.
 */
export const MediaKindBadge: FC<MediaKindBadgeProps> = ({
  kind,
  variant = "row",
}) => {
  const s = useMediaKindBadgeStyles();
  const isSeries = kind === "series";
  const label = isSeries ? "TV series" : "Movie";
  // Tile variant is the visual primary discriminator on a poster card,
  // so it gets an aria-label. Row variant sits next to a title that
  // already carries the same information textually — hide from AT.
  const ariaProps =
    variant === "tile"
      ? { "aria-label": label, title: label }
      : { "aria-hidden": true as const, title: label };

  return (
    <span
      className={mergeClasses(
        s.base,
        variant === "tile" && s.tile,
        variant === "tile" && isSeries && s.tileSeries,
        variant === "row" && s.row,
        variant === "row" && isSeries && s.rowSeries,
      )}
      {...ariaProps}
    >
      {isSeries ? (
        <IconTv width={12} height={12} />
      ) : (
        <IconFilm width={12} height={12} />
      )}
    </span>
  );
};
