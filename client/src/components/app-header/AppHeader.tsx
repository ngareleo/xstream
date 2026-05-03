import { mergeClasses } from "@griffel/react";
import { type FC, useEffect, useRef, useState } from "react";
import { graphql, useMutation } from "react-relay";
import { Link, NavLink, useNavigate } from "react-router-dom";

import { AccountMenu } from "~/components/account-menu/AccountMenu.js";
import { IconRefresh } from "~/lib/icons.js";
import type { AppHeaderScanMutation } from "~/relay/__generated__/AppHeaderScanMutation.graphql.js";

import { strings } from "./AppHeader.strings.js";
import { useAppHeaderStyles } from "./AppHeader.styles.js";

const SCAN_MUTATION = graphql`
  mutation AppHeaderScanMutation {
    scanLibraries {
      id
    }
  }
`;

interface NavEntry {
  to: string;
  label: string;
  end?: boolean;
}

const NAV: NavEntry[] = [
  { to: "/", label: "home", end: true },
  { to: "/profiles", label: "profiles" },
  { to: "/watchlist", label: "watchlist" },
];

const USER = {
  initials: "DG",
  name: "Dag",
  email: "dag@xstream.local",
};

export const AppHeader: FC = () => {
  const styles = useAppHeaderStyles();
  const navigate = useNavigate();
  const [scan, mutationPending] = useMutation<AppHeaderScanMutation>(SCAN_MUTATION);
  const [menuOpen, setMenuOpen] = useState(false);
  const [spinHoldover, setSpinHoldover] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  // Guarantee at least one full rotation of feedback even if the mutation
  // resolves in <100 ms; the design lab's reference behaviour is a 2 s spin.
  const spinning = mutationPending || spinHoldover;

  const handleScan = (): void => {
    if (spinning) return;
    setSpinHoldover(true);
    window.setTimeout(() => setSpinHoldover(false), 2000);
    scan({ variables: {} });
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: MouseEvent): void => {
      if (accountRef.current !== null && !accountRef.current.contains(e.target as Node)) {
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

  const handleSettings = (): void => {
    setMenuOpen(false);
    navigate("/settings");
  };

  const handleSignOut = (): void => {
    setMenuOpen(false);
    navigate("/goodbye");
  };

  return (
    <header className={styles.header}>
      <div className={styles.headerBg} aria-hidden="true" />
      <div className={styles.brandCell}>
        <Link to="/" className={styles.brand} aria-label={strings.brandAriaLabel}>
          <span className={styles.brandX}>X</span>
          <span className={styles.brandWord}>stream</span>
        </Link>
      </div>

      <nav className={styles.navCell} aria-label={strings.navAriaLabel}>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              mergeClasses(styles.navLink, isActive && styles.navLinkActive)
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className={styles.actionsCell}>
        <button
          type="button"
          onClick={handleScan}
          aria-busy={spinning}
          aria-label={spinning ? strings.scanBusyLabel : strings.scanLabel}
          className={styles.scanBtn}
        >
          <span className={mergeClasses(styles.scanIcon, spinning && styles.scanIconSpinning)}>
            <IconRefresh width={22} height={22} />
          </span>
        </button>
        <div ref={accountRef} className={styles.accountWrap}>
          <button
            type="button"
            aria-label={strings.formatString(strings.avatarLabel, USER.name) as string}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={mergeClasses(styles.avatar, menuOpen && styles.avatarOpen)}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {USER.initials}
          </button>
          {menuOpen && (
            <AccountMenu
              initials={USER.initials}
              name={USER.name}
              email={USER.email}
              onSettings={handleSettings}
              onSignOut={handleSignOut}
            />
          )}
        </div>
      </div>
    </header>
  );
};
