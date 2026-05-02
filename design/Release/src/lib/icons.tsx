import { type FC, type SVGProps } from "react";
import { makeStyles } from "@griffel/react";
import {
  ArrowLeftIcon,
  ArrowsExpandIcon,
  CheckIcon,
  ChevronRightIcon,
  CogIcon,
  DesktopComputerIcon,
  ExclamationIcon,
  FilmIcon,
  FolderIcon,
  PauseIcon,
  PlayIcon,
  RefreshIcon,
  SearchIcon,
  VolumeUpIcon,
  XIcon,
} from "@heroicons/react/outline";
import { tokens } from "../styles/tokens.js";

/**
 * Icon library — thin re-export layer over Heroicons Outline v1
 * (matches the Figma "Admin System UI Kit" — `@heroicons/react@1.0.6`).
 *
 * All icons inherit `currentColor` and accept SVGProps. Default canvas
 * is 14×14 to match the previous hand-drawn set's call sites; consumers
 * override via `<IconClose width={12} height={12} />` etc.
 *
 * The aliases (e.g. `IconBack` → `ArrowLeftIcon`) keep the existing
 * import surface stable so the swap is non-breaking for every consumer
 * in the lab. New code SHOULD import the aliased names for consistency.
 */

type IconProps = SVGProps<SVGSVGElement>;

const wrap = (
  Icon: FC<SVGProps<SVGSVGElement>>,
  defaultWidth = 14,
  defaultHeight = 14,
): FC<IconProps> => {
  const Wrapped: FC<IconProps> = ({ width = defaultWidth, height = defaultHeight, ...rest }) => (
    <Icon width={width} height={height} {...rest} />
  );
  return Wrapped;
};

export const IconPlay = wrap(PlayIcon);
export const IconPause = wrap(PauseIcon);
export const IconBack = wrap(ArrowLeftIcon);
export const IconSearch = wrap(SearchIcon);
export const IconFilm = wrap(FilmIcon);
// Heroicons v1 has no TV icon — desktop-computer (a screen with a stand)
// is the closest visual fit for the movie-vs-series discriminator.
export const IconTv = wrap(DesktopComputerIcon);
export const IconFolder = wrap(FolderIcon);
export const IconCog = wrap(CogIcon);
export const IconChevron = wrap(ChevronRightIcon, 10, 10);
export const IconClose = wrap(XIcon, 12, 12);
export const IconVolume = wrap(VolumeUpIcon);
// Heroicons "arrows-expand" is the diagonal four-arrow icon used both
// for full-screen toggles and for "expand to overlay" affordances.
export const IconFullscreen = wrap(ArrowsExpandIcon);
export const IconExpand = wrap(ArrowsExpandIcon);
export const IconRefresh = wrap(RefreshIcon);
export const IconWarn = wrap(ExclamationIcon, 12, 12);
export const IconCheck = wrap(CheckIcon, 12, 12);

const useImdbBadgeStyles = makeStyles({
  badge: {
    backgroundColor: tokens.colorYellow,
    color: "#000",
    paddingTop: "1px",
    paddingBottom: "1px",
    paddingLeft: "4px",
    paddingRight: "4px",
    fontSize: "9px",
    fontWeight: 800,
    letterSpacing: "0.06em",
    borderRadius: "2px",
  },
});

/**
 * Not actually a Heroicon — a styled "IMDb" badge that visually pairs
 * with the rating numerals. Kept here because it's used alongside icons
 * in the same call sites.
 */
export const ImdbBadge: FC = () => {
  const styles = useImdbBadgeStyles();
  return <span className={styles.badge}>IMDb</span>;
};
