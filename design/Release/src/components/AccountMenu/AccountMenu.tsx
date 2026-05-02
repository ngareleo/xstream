import { type FC } from "react";
import { mergeClasses } from "@griffel/react";
import { useAccountMenuStyles } from "./AccountMenu.styles.js";

interface AccountMenuProps {
  initials: string;
  name: string;
  email: string;
  onSettings: () => void;
  onSignOut: () => void;
}

/**
 * Dropdown shown when the AppHeader avatar is clicked.
 * Identity row + Settings + Sign out. The parent owns open/close state
 * (and the click-outside / ESC handlers) — this component is purely
 * presentational.
 */
export const AccountMenu: FC<AccountMenuProps> = ({
  initials,
  name,
  email,
  onSettings,
  onSignOut,
}) => {
  const s = useAccountMenuStyles();
  return (
    <div className={s.menu} role="menu">
      <div className={s.identity}>
        <span className={s.initials} aria-hidden="true">
          {initials}
        </span>
        <div className={s.identityText}>
          <span className={s.name}>{name}</span>
          <span className={s.email}>{email}</span>
        </div>
      </div>
      <div className={s.list}>
        <button
          type="button"
          role="menuitem"
          className={s.item}
          onClick={onSettings}
        >
          Settings
          <span className={s.itemArrow}>→</span>
        </button>
        <button
          type="button"
          role="menuitem"
          className={mergeClasses(s.item, s.itemDanger)}
          onClick={onSignOut}
        >
          Sign out
        </button>
      </div>
    </div>
  );
};
