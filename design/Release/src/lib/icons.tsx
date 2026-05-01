import { type FC, type SVGProps } from "react";
import { makeStyles } from "@griffel/react";
import { tokens } from "../styles/tokens.js";

type IconProps = SVGProps<SVGSVGElement>;

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

export const IconPlay: FC<IconProps> = (p) => (
  <svg width="14" height="14" viewBox="0 0 16 16" {...p}>
    <path
      d="M5 2 L14 8 L5 14 Z"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </svg>
);

export const IconPause: FC<IconProps> = (p) => (
  <svg width="14" height="14" viewBox="0 0 16 16" {...p}>
    <rect x="3" y="2" width="3.5" height="12" fill="currentColor" />
    <rect x="9.5" y="2" width="3.5" height="12" fill="currentColor" />
  </svg>
);

export const IconBack: FC<IconProps> = (p) => (
  <svg width="14" height="14" viewBox="0 0 16 16" {...p}>
    <path d="M10 3 L5 8 L10 13" stroke="currentColor" strokeWidth="1.5" fill="none" />
  </svg>
);

export const IconSearch: FC<IconProps> = (p) => (
  <svg width="14" height="14" viewBox="0 0 16 16" {...p}>
    <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
    <path d="M11 11 L14 14" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

export const IconFilm: FC<IconProps> = (p) => (
  <svg width="14" height="14" viewBox="0 0 16 16" {...p}>
    <rect x="2" y="2" width="12" height="12" stroke="currentColor" strokeWidth="1.2" fill="none" />
    <path d="M5 2 V14 M11 2 V14" stroke="currentColor" strokeWidth="0.8" />
  </svg>
);

export const IconFolder: FC<IconProps> = (p) => (
  <svg width="14" height="14" viewBox="0 0 16 16" {...p}>
    <path d="M2 4 H6 L7 5 H14 V12 H2 Z" stroke="currentColor" strokeWidth="1.2" fill="none" />
  </svg>
);

export const IconCog: FC<IconProps> = (p) => (
  <svg width="14" height="14" viewBox="0 0 16 16" {...p}>
    <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
    <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeDasharray="2 1.5" />
  </svg>
);

export const IconChevron: FC<IconProps> = (p) => (
  <svg width="10" height="10" viewBox="0 0 10 10" {...p}>
    <path d="M3 2 L6 5 L3 8" stroke="currentColor" strokeWidth="1.4" fill="none" />
  </svg>
);

export const IconClose: FC<IconProps> = (p) => (
  <svg width="12" height="12" viewBox="0 0 12 12" {...p}>
    <path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

export const IconVolume: FC<IconProps> = (p) => (
  <svg width="14" height="14" viewBox="0 0 16 16" {...p}>
    <path d="M2 6 H5 L9 3 V13 L5 10 H2 Z" stroke="currentColor" strokeWidth="1.2" fill="none" />
    <path d="M11 5 Q13 8 11 11" stroke="currentColor" strokeWidth="1.2" fill="none" />
  </svg>
);

export const IconFullscreen: FC<IconProps> = (p) => (
  <svg width="14" height="14" viewBox="0 0 16 16" {...p}>
    <path d="M2 5 V2 H5 M11 2 H14 V5 M14 11 V14 H11 M5 14 H2 V11" stroke="currentColor" strokeWidth="1.2" fill="none" />
  </svg>
);

export const IconRefresh: FC<IconProps> = (p) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" {...p}>
    <path
      d="M16.023 9.348h4.992m0 0v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.18 3.183a8.25 8.25 0 0 0 13.804-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const IconWarn: FC<IconProps> = (p) => (
  <svg width="12" height="12" viewBox="0 0 12 12" {...p}>
    <path d="M6 1 L11 11 H1 Z" stroke="var(--yellow)" fill="rgba(245,197,24,0.12)" strokeWidth="1" />
    <circle cx="6" cy="9" r="0.6" fill="var(--yellow)" />
    <rect x="5.5" y="4" width="1" height="3.5" fill="var(--yellow)" />
  </svg>
);

export const ImdbBadge: FC = () => {
  const styles = useImdbBadgeStyles();
  return <span className={styles.badge}>IMDb</span>;
};
