import { mergeClasses } from "@griffel/react";
import { type FC } from "react";
import { NavLink } from "react-router-dom";

import {
  IconAdjustments,
  IconBookmark,
  IconChat,
  IconChevronLeft,
  IconFilm,
  IconSquares,
} from "~/lib/icons.js";

import { useSidebarStyles } from "./Sidebar.styles.js";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export const Sidebar: FC<SidebarProps> = ({ collapsed, onToggle }) => {
  const styles = useSidebarStyles();

  const navItemClass = mergeClasses(styles.navItem, collapsed && styles.navItemCollapsed);

  return (
    <nav className={mergeClasses(styles.root, collapsed && styles.rootCollapsed)}>
      <NavLink to="/" className={navItemClass} end>
        <IconSquares
          size={40}
          className={mergeClasses(styles.navCardIcon, collapsed && styles.navCardIconCollapsed)}
        />
        <span className={mergeClasses(styles.navLabel, collapsed && styles.navLabelHidden)}>
          Profiles
        </span>
        {collapsed && (
          <span className="nav-side-tip" aria-hidden="true">
            Profiles
          </span>
        )}
      </NavLink>

      <NavLink to="/library" className={navItemClass}>
        <IconFilm
          size={40}
          className={mergeClasses(styles.navCardIcon, collapsed && styles.navCardIconCollapsed)}
        />
        <span className={mergeClasses(styles.navLabel, collapsed && styles.navLabelHidden)}>
          Library
        </span>
        {collapsed && (
          <span className="nav-side-tip" aria-hidden="true">
            Library
          </span>
        )}
      </NavLink>

      <NavLink to="/watchlist" className={navItemClass}>
        <IconBookmark
          size={40}
          className={mergeClasses(styles.navCardIcon, collapsed && styles.navCardIconCollapsed)}
        />
        <span className={mergeClasses(styles.navLabel, collapsed && styles.navLabelHidden)}>
          Watchlist
        </span>
        {collapsed && (
          <span className="nav-side-tip" aria-hidden="true">
            Watchlist
          </span>
        )}
      </NavLink>

      <NavLink to="/settings" className={navItemClass}>
        <IconAdjustments
          size={40}
          className={mergeClasses(styles.navCardIcon, collapsed && styles.navCardIconCollapsed)}
        />
        <span className={mergeClasses(styles.navLabel, collapsed && styles.navLabelHidden)}>
          Settings
        </span>
        {collapsed && (
          <span className="nav-side-tip" aria-hidden="true">
            Settings
          </span>
        )}
      </NavLink>

      <NavLink to="/feedback" className={navItemClass}>
        <IconChat
          size={40}
          className={mergeClasses(styles.navCardIcon, collapsed && styles.navCardIconCollapsed)}
        />
        <span className={mergeClasses(styles.navLabel, collapsed && styles.navLabelHidden)}>
          Feedback
        </span>
        {collapsed && (
          <span className="nav-side-tip" aria-hidden="true">
            Feedback
          </span>
        )}
      </NavLink>

      <div className={styles.navSpacer} />

      <button
        className={mergeClasses(styles.collapseBtn, collapsed && styles.collapseBtnCollapsed)}
        onClick={onToggle}
        aria-label="Toggle navigation"
      >
        <IconChevronLeft
          size={15}
          className={mergeClasses(
            styles.collapseBtnIcon,
            collapsed && styles.collapseBtnIconRotated
          )}
        />
        {!collapsed && <span className={styles.navLabel}>Collapse</span>}
      </button>

      <div className={mergeClasses(styles.userSection, collapsed && styles.userSectionCollapsed)}>
        <div className={styles.avatar}>D</div>
        {!collapsed && (
          <div>
            <div className={styles.userName}>User</div>
            <div className={styles.userSub}>0 profiles · 0 files</div>
          </div>
        )}
      </div>
    </nav>
  );
};
