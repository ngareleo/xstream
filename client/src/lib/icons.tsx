import {
  AdjustmentsIcon,
  ArrowLeftIcon,
  ArrowsExpandIcon,
  BookmarkIcon,
  ChatIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CogIcon,
  DesktopComputerIcon,
  DocumentIcon,
  ExclamationCircleIcon,
  ExclamationIcon,
  FastForwardIcon,
  FilmIcon,
  FolderIcon,
  HomeIcon,
  LogoutIcon,
  MenuAlt1Icon,
  PauseIcon,
  PencilAltIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  QuestionMarkCircleIcon,
  RefreshIcon,
  RewindIcon,
  SearchIcon,
  SparklesIcon,
  UserIcon,
  ViewGridIcon,
  VolumeUpIcon,
  XIcon,
} from "@heroicons/react/outline";
import React, { type FC, type SVGProps } from "react";

/**
 * Icon library — thin wrappers over Heroicons Outline v1
 * (`@heroicons/react@1.0.6`). Matches the design system kit in Figma:
 * `Admin System UI Kit (Community)` → frame "Heroicons Outline".
 *
 * Aliases (e.g. `IconBookmark` → `BookmarkIcon`) keep the existing
 * import surface stable so the swap is non-breaking. Each wrapper
 * accepts an optional `size` prop (default 16) for backwards-compat
 * with consumers like `<IconPlay size={9} />`. Inline `style` overrides
 * are merged with the default sizing rules.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const wrap = (Icon: FC<SVGProps<SVGSVGElement>>): FC<IconProps> => {
  const Wrapped: FC<IconProps> = ({ size = 16, style, ...rest }) => (
    <Icon {...rest} style={{ width: size, height: size, flexShrink: 0, ...style }} />
  );
  return Wrapped;
};

export const IconFilm = wrap(FilmIcon);
// Heroicons v1 has no TV icon — desktop-computer is the closest fit.
export const IconTv = wrap(DesktopComputerIcon);
export const IconPlay = wrap(PlayIcon);
export const IconPause = wrap(PauseIcon);
export const IconBackward = wrap(RewindIcon);
export const IconForward = wrap(FastForwardIcon);
export const IconSpeaker = wrap(VolumeUpIcon);
export const IconArrowsOut = wrap(ArrowsExpandIcon);
export const IconPencil = wrap(PencilAltIcon);
export const IconEdit = wrap(PencilIcon);
export const IconRefresh = wrap(RefreshIcon);
export const IconPlus = wrap(PlusIcon);
export const IconClose = wrap(XIcon);
export const IconChevronLeft = wrap(ChevronLeftIcon);
export const IconChevronRight = wrap(ChevronRightIcon);
export const IconChevronDown = wrap(ChevronDownIcon);
export const IconSearch = wrap(SearchIcon);
export const IconDocument = wrap(DocumentIcon);
export const IconWarning = wrap(ExclamationIcon);
export const IconArrowLeft = wrap(ArrowLeftIcon);
export const IconBookmark = wrap(BookmarkIcon);
export const IconCog = wrap(CogIcon);
export const IconFolder = wrap(FolderIcon);
export const IconUser = wrap(UserIcon);
export const IconChat = wrap(ChatIcon);
export const IconAdjustments = wrap(AdjustmentsIcon);
export const IconSquares = wrap(ViewGridIcon);
export const IconBars = wrap(MenuAlt1Icon);
export const IconSparkles = wrap(SparklesIcon);
export const IconQuestion = wrap(QuestionMarkCircleIcon);
export const IconExclamation = wrap(ExclamationCircleIcon);
export const IconSignOut = wrap(LogoutIcon);
export const IconHome = wrap(HomeIcon);
// No bug-specific icon in v1; the warning triangle communicates the
// same "something to look at" affordance the original IconBug did.
export const IconBug = wrap(ExclamationIcon);

/**
 * Heroicons v1 lacks an "arrows-pointing-in" variant (it landed in v2),
 * so we keep this hand-rolled SVG using the v2 path data. It pairs with
 * `IconArrowsOut` for fullscreen exit. When we eventually migrate to
 * Heroicons v2, swap this for `ArrowsPointingInIcon`.
 */
export const IconArrowsIn: FC<IconProps> = ({ size = 16, style, ...rest }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...rest}
    style={{ width: size, height: size, flexShrink: 0, ...style }}
  >
    <path d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
  </svg>
);

/**
 * Spinner uses an inline CSS animation (`animation: spin 0.8s linear
 * infinite`) and a heavier stroke than the Heroicons defaults — keeping
 * it as a hand-rolled SVG avoids a wrapper that would override those.
 */
export const IconSpinner: FC<IconProps> = ({ size = 16, style, ...rest }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    {...rest}
    style={{
      width: size,
      height: size,
      flexShrink: 0,
      animation: "spin 0.8s linear infinite",
      ...style,
    }}
  >
    <path d="M12 2a10 10 0 0 1 10 10" opacity="1" />
    <path d="M12 2a10 10 0 0 0-10 10" opacity="0.25" />
  </svg>
);

/**
 * xstream brand mark — not a Heroicon. Stays bespoke.
 */
export const LogoShield = (): React.JSX.Element => (
  <svg width="24" height="28" viewBox="0 0 24 28" fill="none">
    <path
      d="M12 1L23 6v13Q23 26 12 27Q1 26 1 19V6Z"
      fill="#CE1126"
      opacity="0.15"
      stroke="#CE1126"
      strokeWidth="0.8"
    />
    <path d="M12 5L19 9v10Q19 23 12 25Q5 23 5 19V9Z" fill="#CE1126" opacity="0.2" />
    <line x1="12" y1="1.5" x2="12" y2="26.5" stroke="white" strokeWidth="1.2" opacity="0.6" />
    <line x1="6" y1="11" x2="18" y2="19" stroke="white" strokeWidth="0.8" opacity="0.4" />
    <line x1="18" y1="11" x2="6" y2="19" stroke="white" strokeWidth="0.8" opacity="0.4" />
  </svg>
);
