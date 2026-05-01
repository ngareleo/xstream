import { type FC, type ReactNode } from "react";
import { Logo01 } from "./Logo01.js";
import { Logo02 } from "./Logo02.js";
import { Logo03 } from "./Logo03.js";
import { Logo04 } from "./Logo04.js";
import { Logo05 } from "./Logo05.js";
import { Logo06 } from "./Logo06.js";
import { Logo07 } from "./Logo07.js";

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

export const LogoCard: FC<LogoCardProps> = ({ entry, highlighted }) => (
  <div
    style={{
      background: "var(--surface)",
      border: highlighted
        ? "1px solid var(--green)"
        : "1px solid var(--border)",
      boxShadow: highlighted ? "0 0 0 3px var(--green-soft)" : "none",
      borderRadius: 4,
      padding: "32px 28px 22px",
      display: "flex",
      flexDirection: "column",
      minHeight: 360,
      position: "relative",
      overflow: "hidden",
    }}
  >
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 14,
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--text-faint)",
      }}
    >
      {entry.code}
    </div>
    {highlighted && (
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 14,
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.2em",
          color: "var(--green)",
        }}
      >
        ● DEFAULT
      </div>
    )}
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "28px 0",
      }}
    >
      {entry.render()}
    </div>
    <div
      style={{
        borderTop: "1px solid var(--border-soft)",
        paddingTop: 12,
        marginTop: 12,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 16,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--text-dim)",
          letterSpacing: "0.06em",
        }}
      >
        {entry.num} / {entry.title}
      </div>
      <div
        style={{
          fontSize: 10,
          color: "var(--text-muted)",
          textAlign: "right",
          maxWidth: "60%",
          lineHeight: 1.4,
        }}
      >
        {entry.notes}
      </div>
    </div>
  </div>
);
