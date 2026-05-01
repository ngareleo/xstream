import { type FC, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { mergeClasses } from "@griffel/react";
import { IconRefresh } from "../../lib/icons.js";
import { user } from "../../data/mock.js";
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
  const [scanning, setScanning] = useState(false);

  const handleScan = (): void => {
    if (scanning) return;
    setScanning(true);
    window.setTimeout(() => setScanning(false), 2000);
  };

  return (
    <header className={s.header}>
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
        <button
          type="button"
          aria-label={`Account · ${user.name}`}
          className={s.avatar}
        >
          {user.initials}
        </button>
      </div>
    </header>
  );
};
