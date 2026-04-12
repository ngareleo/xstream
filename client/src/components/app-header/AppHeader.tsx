import { type FC, type ReactNode } from "react";

import { LogoShield } from "~/lib/icons.js";

import { strings } from "./AppHeader.strings.js";
import { useAppHeaderStyles } from "./AppHeader.styles.js";

interface AppHeaderProps {
  actions?: ReactNode;
}

export const AppHeader: FC<AppHeaderProps> = ({ actions }) => {
  const styles = useAppHeaderStyles();

  return (
    <header className={styles.root}>
      <div className={styles.brand}>
        <LogoShield />
        <div className={styles.brandText}>
          <div className={styles.logoMark}>{strings.brandName}</div>
        </div>
      </div>

      <div className={styles.content} />

      {actions && <div className={styles.actionsSlot}>{actions}</div>}
    </header>
  );
};
