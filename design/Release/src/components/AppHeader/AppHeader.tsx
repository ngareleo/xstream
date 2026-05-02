import { type FC, useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { mergeClasses } from "@griffel/react";
import { IconRefresh } from "../../lib/icons.js";
import { user } from "../../data/mock.js";
import { AccountMenu } from "../AccountMenu/AccountMenu.js";
import { useAppHeaderStyles } from "./AppHeader.styles.js";

interface NavEntry {
  to: string;
  label: string;
  end?: boolean;
}

const NAV: NavEntry[] = [
  { to: "/", label: "Home", end: true },
  { to: "/profiles", label: "Profiles" },
  { to: "/watchlist", label: "Watchlist" },
];

export const AppHeader: FC = () => {
  const s = useAppHeaderStyles();
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  const handleScan = (): void => {
    if (scanning) return;
    setScanning(true);
    window.setTimeout(() => setScanning(false), 2000);
  };

  // Click-outside + ESC to close the account menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: MouseEvent): void => {
      if (
        accountRef.current !== null &&
        !accountRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const goSettings = (): void => {
    setMenuOpen(false);
    navigate("/settings");
  };

  const goGoodbye = (): void => {
    setMenuOpen(false);
    navigate("/goodbye");
  };

  return (
    <header className={s.header}>
      <div className={s.headerBg} aria-hidden="true" />
      <div className={s.brandCell}>
        <Link to="/" className={s.brand} aria-label="Xstream — home">
          <span className={s.brandX}>X</span>
          <span className={s.brandWord}>stream</span>
        </Link>
      </div>

      <nav className={s.navCell} aria-label="Primary">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              mergeClasses(s.navLink, isActive && s.navLinkActive)
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className={s.actionsCell}>
        <button
          type="button"
          onClick={handleScan}
          aria-busy={scanning}
          aria-label={scanning ? "Scanning library" : "Scan library"}
          className={s.scanBtn}
        >
          <span
            className={mergeClasses(s.scanIcon, scanning && s.scanIconSpinning)}
          >
            <IconRefresh width={22} height={22} />
          </span>
        </button>
        <div ref={accountRef} className={s.accountWrap}>
          <button
            type="button"
            aria-label={`Account · ${user.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={mergeClasses(s.avatar, menuOpen && s.avatarOpen)}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {user.initials}
          </button>
          {menuOpen && (
            <AccountMenu
              initials={user.initials}
              name={user.name}
              email={user.email}
              onSettings={goSettings}
              onSignOut={goGoodbye}
            />
          )}
        </div>
      </div>
    </header>
  );
};
