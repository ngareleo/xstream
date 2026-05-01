import { type FC, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { mergeClasses } from "@griffel/react";
import {
  IconChevron,
  IconCog,
  IconFilm,
  IconFolder,
} from "../../lib/icons.js";
import { profiles, user } from "../../data/mock.js";
import { useSidebarStyles } from "./Sidebar.styles.js";

interface NavItemDef {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

const NAV_ITEMS: NavItemDef[] = [
  { to: "/", label: "Profiles", icon: <IconFolder />, end: true },
  { to: "/library", label: "Library", icon: <IconFilm /> },
  { to: "/settings", label: "Settings", icon: <IconCog /> },
  { to: "/design-system", label: "Design system", icon: <IconFilm /> },
];

export const Sidebar: FC = () => {
  const s = useSidebarStyles();
  return (
    <aside className={s.side}>
      <div className={s.sectionLabel}>NAVIGATION</div>
      {NAV_ITEMS.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.end}
          className={({ isActive }) =>
            mergeClasses(s.navItem, isActive && s.navItemActive)
          }
        >
          <span style={{ opacity: 0.9 }}>{it.icon}</span>
          <span>{it.label}</span>
        </NavLink>
      ))}

      <div className={mergeClasses(s.sectionLabel, s.sectionLabelTopGap)}>
        LIBRARIES
      </div>
      {profiles.map((p) => {
        const ok = p.unmatched === 0 && !p.scanning;
        return (
          <div key={p.id} className={s.libraryRow}>
            <span className={s.libraryName}>
              <span
                className={mergeClasses(
                  s.libraryDot,
                  ok ? s.libraryDotOk : s.libraryDotWarn,
                )}
              />
              {p.name}
            </span>
            <span className={s.libraryCount}>
              {p.filmCount ?? p.episodeCount ?? 0}
            </span>
          </div>
        );
      })}

      <div className={s.spacer} />

      <div className={s.userRow}>
        <div className={s.avatar}>{user.initials}</div>
        <div className={s.userTextCol}>
          <div className={s.userName}>{user.name}</div>
          <div className={s.userMeta}>{user.hostMode}</div>
        </div>
        <span className={s.chev}>
          <IconChevron />
        </span>
      </div>
    </aside>
  );
};
