import { type FC, useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  IconSquares,
  IconFilm,
  IconBookmark,
  IconAdjustments,
  IconChat,
  IconChevronLeft,
  IconChevronRight,
  IconUser,
  IconHome,
  IconSignOut,
  IconWarning,
  LogoShield,
} from "../../lib/icons.js";
import { user, profiles } from "../../data/mock.js";
import "./Sidebar.css";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

// ── SignOutDialog ─────────────────────────────────────────────────────────────

const SignOutDialog: FC<{ onCancel: () => void; onConfirm: () => void }> = ({
  onCancel,
  onConfirm,
}) => (
  <div className="dialog-overlay" onClick={onCancel}>
    <div className="dialog" onClick={(e) => e.stopPropagation()}>
      <div className="dialog-icon">
        <IconWarning size={20} />
      </div>
      <div className="dialog-title">Sign out of Moran?</div>
      <div className="dialog-body">
        You'll need to sign back in to access your library. Any active
        streams will stop.
      </div>
      <div className="dialog-actions">
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-danger btn-sm" onClick={onConfirm}>
          <IconSignOut size={12} />
          Sign out
        </button>
      </div>
    </div>
  </div>
);

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

  const go = (path: string) => { navigate(path); onClose(); };

  return (
    <div
      ref={ref}
      className={`profile-menu${collapsed ? " profile-menu-collapsed" : ""}`}
    >
      {/* User info */}
      <div className="pm-user-head">
        <div className="pm-avatar">{user.avatar}</div>
        <div className="pm-user-info">
          <div className="pm-user-name">{user.name}</div>
          <div className="pm-user-email">{user.email}</div>
        </div>
      </div>

      {/* Profiles */}
      <div className="pm-section-label">Profiles</div>
      {profiles.map((p) => (
        <button key={p.id} className="pm-item" onClick={() => go("/")}>
          <span className="pm-item-dot" />
          <span className="pm-item-name">{p.name}</span>
          <span className="pm-item-count">
            {p.type === "tv"
              ? `${p.showCount ?? 0} shows`
              : `${p.filmCount ?? 0} films`}
          </span>
        </button>
      ))}

      <div className="pm-divider" />

      <button className="pm-item" onClick={() => go("/")}>
        <IconHome size={13} />
        <span className="pm-item-name">Go to home</span>
      </button>

      <button className="pm-item" onClick={() => go("/settings?section=account")}>
        <IconUser size={13} />
        <span className="pm-item-name">Account settings</span>
      </button>

      <div className="pm-divider" />

      <button className="pm-item pm-item-danger" onClick={() => { onClose(); onSignOut(); }}>
        <IconSignOut size={13} />
        <span className="pm-item-name">Sign out</span>
      </button>
    </div>
  );
};

// ── Sidebar ───────────────────────────────────────────────────────────────────

export const Sidebar: FC<SidebarProps> = ({ collapsed, onToggle }) => {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const handleSignOut = () => {
    setConfirmSignOut(false);
    navigate("/goodbye");
  };

  return (
    <>
      <nav className={`sidebar${collapsed ? " collapsed" : ""}`}>
        <NavLink to="/" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`} end>
          <IconSquares size={40} className="nav-card-icon" />
          <span className="nav-label">Profiles</span>
          <span className="nav-side-tip" aria-hidden="true">Profiles</span>
        </NavLink>

        <NavLink to="/library" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <IconFilm size={40} className="nav-card-icon" />
          <span className="nav-label">Library</span>
          <span className="nav-side-tip" aria-hidden="true">Library</span>
        </NavLink>

        <NavLink
          to="/watchlist"
          className={({ isActive }) => `nav-item notify-amber${isActive ? " active" : ""}`}
          data-count="6"
        >
          <IconBookmark size={40} className="nav-card-icon" />
          <span className="nav-label">Watchlist</span>
          <span className="nav-side-tip" aria-hidden="true">Watchlist</span>
        </NavLink>

        <NavLink to="/settings" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <IconAdjustments size={40} className="nav-card-icon" />
          <span className="nav-label">Settings</span>
          <span className="nav-side-tip" aria-hidden="true">Settings</span>
        </NavLink>

        <NavLink to="/feedback" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <IconChat size={40} className="nav-card-icon" />
          <span className="nav-label">Feedback</span>
          <span className="nav-side-tip" aria-hidden="true">Feedback</span>
        </NavLink>

        <div className="nav-spacer" />

        <button
          className="sidebar-collapse-btn"
          onClick={onToggle}
          aria-label="Toggle navigation"
        >
          <IconChevronLeft size={15} />
          <span className="nav-label">Collapse</span>
        </button>

        {/* Profile button */}
        <div className="sidebar-user-wrap">
          {menuOpen && (
            <ProfileMenu
              onClose={() => setMenuOpen(false)}
              onSignOut={() => setConfirmSignOut(true)}
              collapsed={collapsed}
            />
          )}
          <button
            className={`sidebar-user${menuOpen ? " menu-open" : ""}`}
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Open profile menu"
            aria-expanded={menuOpen}
          >
            <div className="avatar">{user.avatar}</div>
            {!collapsed && (
              <>
                <div className="sidebar-user-text">
                  <div className="user-name">{user.name}</div>
                  <div className="user-sub">{user.totalProfiles} profiles · {user.totalFiles} files</div>
                </div>
                <IconChevronRight size={12} className={`user-chevron${menuOpen ? " open" : ""}`} />
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
