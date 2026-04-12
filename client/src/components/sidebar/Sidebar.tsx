import { mergeClasses } from "@griffel/react";
import { type FC, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { useLibraries } from "~/components/app-shell/AppShell.js";
import {
  IconAdjustments,
  IconBookmark,
  IconChat,
  IconChevronLeft,
  IconChevronRight,
  IconFilm,
  IconHome,
  IconSignOut,
  IconSquares,
  IconUser,
} from "~/lib/icons.js";

import { strings } from "./Sidebar.strings.js";
import { useSidebarStyles } from "./Sidebar.styles.js";
import { SignOutDialogAsync } from "./SignOutDialogAsync.js";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

// ─── ProfileMenu ──────────────────────────────────────────────────────────────

interface ProfileMenuProps {
  collapsed: boolean;
  onClose: () => void;
  onSignOut: () => void;
}

const ProfileMenu: FC<ProfileMenuProps> = ({ collapsed, onClose, onSignOut }) => {
  const navigate = useNavigate();
  const styles = useSidebarStyles();
  const ref = useRef<HTMLDivElement>(null);
  const libraries = useLibraries();

  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    // Defer so the same click that opened the menu doesn't immediately close it
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const go = useCallback(
    (path: string): void => {
      navigate(path);
      onClose();
    },
    [navigate, onClose]
  );

  return (
    <div
      ref={ref}
      className={mergeClasses(styles.profileMenu, collapsed && styles.profileMenuCollapsed)}
    >
      {/* User info */}
      <div className={styles.pmUserHead}>
        <div className={styles.pmAvatar}>D</div>
        <div className={styles.pmUserInfo}>
          <div className={styles.pmUserName}>{strings.pmUserName}</div>
          <div className={styles.pmUserEmail}>{strings.pmUserEmail}</div>
        </div>
      </div>

      <div className={styles.pmSectionLabel}>{strings.pmSectionProfiles}</div>
      <button className={styles.pmItem} onClick={() => go("/")} type="button">
        <div className={styles.pmItemDot} />
        <span className={styles.pmItemName}>{strings.pmAllLibraries}</span>
      </button>
      {libraries.map((lib) => (
        <button
          key={lib.id}
          className={styles.pmItem}
          onClick={() => go(`/?libraryId=${encodeURIComponent(lib.id)}`)}
          type="button"
        >
          <div className={styles.pmItemDot} />
          <span className={styles.pmItemName}>{lib.name}</span>
        </button>
      ))}

      <div className={styles.pmDivider} />

      <button className={styles.pmItem} onClick={() => go("/")} type="button">
        <IconHome size={13} />
        <span className={styles.pmItemName}>{strings.pmHome}</span>
      </button>

      <button className={styles.pmItem} onClick={() => go("/settings")} type="button">
        <IconUser size={13} />
        <span className={styles.pmItemName}>{strings.pmAccountSettings}</span>
      </button>

      <div className={styles.pmDivider} />

      <button
        className={mergeClasses(styles.pmItem, styles.pmItemDanger)}
        onClick={() => {
          onClose();
          onSignOut();
        }}
        type="button"
      >
        <IconSignOut size={13} />
        <span className={styles.pmItemName}>{strings.pmSignOut}</span>
      </button>
    </div>
  );
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export const Sidebar: FC<SidebarProps> = ({ collapsed, onToggle }) => {
  const navigate = useNavigate();
  const styles = useSidebarStyles();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const libraries = useLibraries();
  const totalFiles = libraries.reduce((s, l) => s + l.fileCount, 0);
  const userSub = `${libraries.length} profiles · ${totalFiles} files`;

  const navClass = ({ isActive }: { isActive: boolean }): string =>
    mergeClasses(
      styles.navItem,
      collapsed && styles.navItemCollapsed,
      isActive && (collapsed ? styles.navItemCollapsedActive : styles.navItemActive)
    );

  const handleSignOut = (): void => {
    setConfirmSignOut(false);
    navigate("/goodbye");
  };

  return (
    <>
      <nav className={mergeClasses(styles.root, collapsed && styles.rootCollapsed)}>
        <NavLink to="/" className={navClass} end>
          <IconSquares
            size={40}
            className={mergeClasses(styles.navCardIcon, collapsed && styles.navCardIconCollapsed)}
          />
          <span className={mergeClasses(styles.navLabel, collapsed && styles.navLabelHidden)}>
            {strings.navProfiles}
          </span>
          {collapsed && (
            <span className={styles.navSideTip} aria-hidden="true">
              {strings.navProfiles}
            </span>
          )}
        </NavLink>

        <NavLink to="/library" className={navClass}>
          <IconFilm
            size={40}
            className={mergeClasses(styles.navCardIcon, collapsed && styles.navCardIconCollapsed)}
          />
          <span className={mergeClasses(styles.navLabel, collapsed && styles.navLabelHidden)}>
            {strings.navLibrary}
          </span>
          {collapsed && (
            <span className={styles.navSideTip} aria-hidden="true">
              {strings.navLibrary}
            </span>
          )}
        </NavLink>

        <NavLink to="/watchlist" className={navClass}>
          <IconBookmark
            size={40}
            className={mergeClasses(styles.navCardIcon, collapsed && styles.navCardIconCollapsed)}
          />
          <span className={mergeClasses(styles.navLabel, collapsed && styles.navLabelHidden)}>
            {strings.navWatchlist}
          </span>
          {collapsed && (
            <span className={styles.navSideTip} aria-hidden="true">
              {strings.navWatchlist}
            </span>
          )}
        </NavLink>

        <NavLink to="/settings" className={navClass}>
          <IconAdjustments
            size={40}
            className={mergeClasses(styles.navCardIcon, collapsed && styles.navCardIconCollapsed)}
          />
          <span className={mergeClasses(styles.navLabel, collapsed && styles.navLabelHidden)}>
            {strings.navSettings}
          </span>
          {collapsed && (
            <span className={styles.navSideTip} aria-hidden="true">
              {strings.navSettings}
            </span>
          )}
        </NavLink>

        <NavLink to="/feedback" className={navClass}>
          <IconChat
            size={40}
            className={mergeClasses(styles.navCardIcon, collapsed && styles.navCardIconCollapsed)}
          />
          <span className={mergeClasses(styles.navLabel, collapsed && styles.navLabelHidden)}>
            {strings.navFeedback}
          </span>
          {collapsed && (
            <span className={styles.navSideTip} aria-hidden="true">
              {strings.navFeedback}
            </span>
          )}
        </NavLink>

        <div className={styles.navSpacer} />

        <button
          className={mergeClasses(styles.collapseBtn, collapsed && styles.collapseBtnCollapsed)}
          onClick={onToggle}
          aria-label={strings.toggleNavAriaLabel}
          type="button"
        >
          <IconChevronLeft
            size={15}
            className={mergeClasses(
              styles.collapseBtnIcon,
              collapsed && styles.collapseBtnIconRotated
            )}
          />
          {!collapsed && <span className={styles.navLabel}>{strings.collapseLabel}</span>}
        </button>

        {/* Profile button */}
        <div className={styles.userWrap}>
          {menuOpen && (
            <ProfileMenu
              collapsed={collapsed}
              onClose={() => setMenuOpen(false)}
              onSignOut={() => setConfirmSignOut(true)}
            />
          )}
          <button
            className={mergeClasses(
              styles.userBtn,
              menuOpen && styles.userBtnMenuOpen,
              collapsed && styles.userBtnCollapsed
            )}
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={strings.openProfileMenuAriaLabel}
            aria-expanded={menuOpen}
            type="button"
          >
            <div className={styles.avatar}>D</div>
            {!collapsed && (
              <>
                <div className={styles.userText}>
                  <div className={styles.userName}>{strings.userName}</div>
                  <div className={styles.userSub}>{userSub}</div>
                </div>
                <IconChevronRight
                  size={12}
                  className={mergeClasses(styles.userChevron, menuOpen && styles.userChevronOpen)}
                />
              </>
            )}
          </button>
        </div>
      </nav>

      {confirmSignOut && (
        <Suspense fallback={null}>
          <SignOutDialogAsync onCancel={() => setConfirmSignOut(false)} onConfirm={handleSignOut} />
        </Suspense>
      )}
    </>
  );
};
