import { type FC, type ReactNode } from "react";
import { LogoShield } from "../../lib/icons.js";
import { useAppHeaderStyles } from "./AppHeader.styles.js";

interface AppHeaderProps {
  collapsed: boolean;
  children?: ReactNode;
}

export const AppHeader: FC<AppHeaderProps> = ({ collapsed, children }) => {
  const styles = useAppHeaderStyles();
  return (
    <header className={styles.root}>
      <div className={collapsed ? styles.brandCollapsed : styles.brand}>
        <LogoShield />
        <div className={styles.brandText}>
          <div className={styles.logoMark}>MORAN</div>
        </div>
      </div>
      <div className={styles.content}>{children}</div>
    </header>
  );
};
