import { type FC } from "react";
import { NavLink } from "react-router-dom";
import {
  IconSquares,
  IconFilm,
  IconBookmark,
  IconAdjustments,
  IconChat,
  IconChevronLeft,
  LogoShield,
} from "../../lib/icons.js";
import { user } from "../../data/mock.js";
import "./Sidebar.css";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export const Sidebar: FC<SidebarProps> = ({ collapsed, onToggle }) => {
  return (
    <nav className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <NavLink to="/" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`} end>
        <IconSquares size={40} className="nav-card-icon" />
        <span className="nav-label">Profiles</span>
      </NavLink>

      <NavLink to="/library" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
        <IconFilm size={40} className="nav-card-icon" />
        <span className="nav-label">Library</span>
      </NavLink>

      <NavLink
        to="/watchlist"
        className={({ isActive }) => `nav-item notify-amber${isActive ? " active" : ""}`}
        data-count="6"
      >
        <IconBookmark size={40} className="nav-card-icon" />
        <span className="nav-label">Watchlist</span>
      </NavLink>

      <NavLink to="/settings" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
        <IconAdjustments size={40} className="nav-card-icon" />
        <span className="nav-label">Settings</span>
      </NavLink>

      <NavLink to="/feedback" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
        <IconChat size={40} className="nav-card-icon" />
        <span className="nav-label">Feedback</span>
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

      <div className="sidebar-user">
        <div className="avatar">{user.avatar}</div>
        <div>
          <div className="user-name">{user.name}</div>
          <div className="user-sub">{user.totalProfiles} profiles · {user.totalFiles} files</div>
        </div>
      </div>
    </nav>
  );
};
