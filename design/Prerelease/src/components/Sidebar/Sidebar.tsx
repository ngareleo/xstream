import { mergeClasses } from "@griffel/react";
import { type FC, useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  IconSquares,
  IconFilm,
  IconAdjustments,
  IconChat,
  IconChevronLeft,
  IconChevronRight,
  IconUser,
  IconHome,
  IconSignOut,
  IconWarning,
} from "../../lib/icons.js";
import { user, profiles } from "../../data/mock.js";
import { useSidebarStyles } from "./Sidebar.styles.js";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

// ── SignOutDialog ─────────────────────────────────────────────────────────────

const SignOutDialog: FC<{ onCancel: () => void; onConfirm: () => void }> = ({
  onCancel,
  onConfirm,
}) => {
  const styles = useSidebarStyles();
  return (
    <div className={styles.dialogOverlay} onClick={onCancel}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.dialogIcon}>
          <IconWarning size={20} />
        </div>
        <div className={styles.dialogTitle}>Sign out of Moran?</div>
        <div className={styles.dialogBody}>
          You'll need to sign back in to access your library. Any active
          streams will stop.
        </div>
        <div className={styles.dialogActions}>
          <button className={styles.btnGhost} onClick={onCancel}>
            Cancel
          </button>
          <button className={styles.btnDanger} onClick={onConfirm}>
            <IconSignOut size={12} />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};

// ── ProfileMenu ───────────────────────────────────────────────────────────────

const ProfileMenu: FC<{
  onClose: () => void;
  onSignOut: () => void;
  collapsed: boolean;
}> = ({ onClose, onSignOut, collapsed }) => {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    // Defer so the same click that opened the menu doesn't immediately close it
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const styles = useSidebarStyles();
  const go = (path: string) => { navigate(path); onClose(); };

  return (
    <div
      ref={ref}
      className={mergeClasses(styles.profileMenu, collapsed && styles.profileMenuCollapsed)}
    >
      {/* User info */}
      <div className={styles.pmUserHead}>
        <div className={styles.pmAvatar}>{user.avatar}</div>
        <div className={styles.pmUserInfo}>
          <div className={styles.pmUserName}>{user.name}</div>
          <div className={styles.pmUserEmail}>{user.email}</div>
        </div>
      </div>

      {/* Profiles */}
      <div className={styles.pmSectionLabel}>Profiles</div>
      {profiles.map((p) => (
        <button key={p.id} className={styles.pmItem} onClick={() => go(`/library?profile=${p.id}`)}>
          <span className={styles.pmItemDot} />
          <span className={styles.pmItemName}>{p.name}</span>
          <span className={styles.pmItemCount}>
            {p.type === "tv"
              ? `${p.showCount ?? 0} shows`
              : `${p.filmCount ?? 0} films`}
          </span>
        </button>
      ))}

      <div className={styles.pmDivider} />

      <button className={styles.pmItem} onClick={() => go("/")}>
        <IconHome size={13} />
        <span className={styles.pmItemName}>Go to home</span>
      </button>

      <button className={styles.pmItem} onClick={() => go("/settings?section=account")}>
        <IconUser size={13} />
        <span className={styles.pmItemName}>Account settings</span>
      </button>

      <div className={styles.pmDivider} />

      <button className={mergeClasses(styles.pmItem, styles.pmItemDanger)} onClick={() => { onClose(); onSignOut(); }}>
        <IconSignOut size={13} />
        <span className={styles.pmItemName}>Sign out</span>
      </button>
    </div>
  );
};

// ── Sidebar ───────────────────────────────────────────────────────────────────

export const Sidebar: FC<SidebarProps> = ({ collapsed, onToggle }) => {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const styles = useSidebarStyles();

  const handleSignOut = () => {
    setConfirmSignOut(false);
    navigate("/goodbye");
  };

  const navItemClass = (isActive: boolean) =>
    mergeClasses(
      styles.navItem,
      isActive && styles.navItemActive,
      collapsed && styles.navItemCollapsed,
      isActive && collapsed && styles.navItemCollapsedActive,
    );

  return (
    <>
      <nav className={mergeClasses(styles.root, collapsed && styles.rootCollapsed)}>
        <NavLink to="/" className={({ isActive }) => navItemClass(isActive)} end>
          <IconSquares size={40} className={mergeClasses(styles.navCardIcon, collapsed && styles.navCardIconCollapsed)} />
          <span className={mergeClasses(styles.navLabel, collapsed && styles.navLabelHidden)}>Profiles</span>
          <span className={mergeClasses(styles.navSideTip, collapsed && styles.navSideTipVisible, !collapsed && styles.navSideTipHidden)} aria-hidden="true">Profiles</span>
        </NavLink>

        <NavLink to="/library" className={({ isActive }) => navItemClass(isActive)}>
          <IconFilm size={40} className={mergeClasses(styles.navCardIcon, collapsed && styles.navCardIconCollapsed)} />
          <span className={mergeClasses(styles.navLabel, collapsed && styles.navLabelHidden)}>Library</span>
          <span className={mergeClasses(styles.navSideTip, collapsed && styles.navSideTipVisible, !collapsed && styles.navSideTipHidden)} aria-hidden="true">Library</span>
        </NavLink>

        <NavLink to="/settings" className={({ isActive }) => navItemClass(isActive)}>
          <IconAdjustments size={40} className={mergeClasses(styles.navCardIcon, collapsed && styles.navCardIconCollapsed)} />
          <span className={mergeClasses(styles.navLabel, collapsed && styles.navLabelHidden)}>Settings</span>
          <span className={mergeClasses(styles.navSideTip, collapsed && styles.navSideTipVisible, !collapsed && styles.navSideTipHidden)} aria-hidden="true">Settings</span>
        </NavLink>

        <NavLink to="/feedback" className={({ isActive }) => navItemClass(isActive)}>
          <IconChat size={40} className={mergeClasses(styles.navCardIcon, collapsed && styles.navCardIconCollapsed)} />
          <span className={mergeClasses(styles.navLabel, collapsed && styles.navLabelHidden)}>Feedback</span>
          <span className={mergeClasses(styles.navSideTip, collapsed && styles.navSideTipVisible, !collapsed && styles.navSideTipHidden)} aria-hidden="true">Feedback</span>
        </NavLink>

        <div className={styles.navSpacer} />

        <button
          className={mergeClasses(styles.collapseBtn, collapsed && styles.collapseBtnCollapsed)}
          onClick={onToggle}
          aria-label="Toggle navigation"
        >
          <IconChevronLeft size={15} className={mergeClasses(styles.collapseBtnIcon, collapsed && styles.collapseBtnIconRotated)} />
          <span className={mergeClasses(styles.navLabel, collapsed && styles.navLabelHidden)}>Collapse</span>
        </button>

        {/* Profile button */}
        <div className={styles.userWrap}>
          {menuOpen && (
            <ProfileMenu
              onClose={() => setMenuOpen(false)}
              onSignOut={() => setConfirmSignOut(true)}
              collapsed={collapsed}
            />
          )}
          <button
            className={mergeClasses(styles.userBtn, menuOpen && styles.userBtnMenuOpen, collapsed && styles.userBtnCollapsed)}
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Open profile menu"
            aria-expanded={menuOpen}
          >
            <div className={styles.avatar}>{user.avatar}</div>
            {!collapsed && (
              <>
                <div className={styles.userText}>
                  <div className={styles.userName}>{user.name}</div>
                  <div className={styles.userSub}>{user.totalProfiles} profiles · {user.totalFiles} files</div>
                </div>
                <IconChevronRight size={12} className={mergeClasses(styles.userChevron, menuOpen && styles.userChevronOpen)} />
              </>
            )}
          </button>
        </div>
      </nav>

      {confirmSignOut && (
        <SignOutDialog
          onCancel={() => setConfirmSignOut(false)}
          onConfirm={handleSignOut}
        />
      )}
    </>
  );
};
