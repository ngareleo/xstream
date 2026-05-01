import { type FC, type ReactNode } from "react";
import { mergeClasses } from "@griffel/react";
import { Logo01 } from "./Logo01.js";
import { Logo02 } from "./Logo02.js";
import { Logo03 } from "./Logo03.js";
import { Logo04 } from "./Logo04.js";
import { Logo05 } from "./Logo05.js";
import { Logo06 } from "./Logo06.js";
import { Logo07 } from "./Logo07.js";
import { useLogoCardStyles } from "./LogoCard.styles.js";

export { Logo01, Logo02, Logo03, Logo04, Logo05, Logo06, Logo07 };

export interface LogoEntry {
  code: string;
  num: string;
  title: string;
  notes: string;
  render: () => ReactNode;
}

export const LOGOS: LogoEntry[] = [
  {
    code: "WM-01",
    num: "01",
    title: "Anton + chevron mark",
    notes: "Compact lockup. Chevrons hint at FFWD / streams.",
    render: () => <Logo01 />,
  },
  {
    code: "MK-02",
    num: "02",
    title: "Stacked X monogram",
    notes: "Standalone mark for app icon, favicon, splash. Currently the working default.",
    render: () => <Logo02 />,
  },
  {
    code: "WM-03",
    num: "03",
    title: "Signal-bar X + tagline",
    notes: "Cinema bars form X — tech + film hybrid.",
    render: () => <Logo03 />,
  },
  {
    code: "WM-04",
    num: "04",
    title: "Cinematic display lockup",
    notes: "Custom X letterform. Marquee feel. Use big.",
    render: () => <Logo04 />,
  },
  {
    code: "WM-05",
    num: "05",
    title: "Frame strip",
    notes: "Each letter as a frame. Editorial, archival.",
    render: () => <Logo05 />,
  },
  {
    code: "WM-06",
    num: "06",
    title: "Slashed condensed",
    notes: "Self-hosted, dev-confident. Scales down well.",
    render: () => <Logo06 />,
  },
  {
    code: "WM-07",
    num: "07",
    title: "Bracketed monogram",
    notes: "Quietest option. Brackets reference TUI / CLI.",
    render: () => <Logo07 />,
  },
];

interface LogoCardProps {
  entry: LogoEntry;
  highlighted?: boolean;
}

export const LogoCard: FC<LogoCardProps> = ({ entry, highlighted }) => {
  const styles = useLogoCardStyles();
  return (
    <div className={mergeClasses(styles.card, highlighted && styles.cardHighlighted)}>
      <div className={styles.code}>{entry.code}</div>
      {highlighted && <div className={styles.defaultBadge}>● DEFAULT</div>}
      <div className={styles.stage}>{entry.render()}</div>
      <div className={styles.meta}>
        <div className={styles.metaLabel}>
          {entry.num} / {entry.title}
        </div>
        <div className={styles.metaNotes}>{entry.notes}</div>
      </div>
    </div>
  );
};
