import { type FC, type ReactNode } from "react";
import { LogoShield } from "../../lib/icons.js";

interface AppHeaderProps {
  collapsed: boolean;
  children?: ReactNode;
}

export const AppHeader: FC<AppHeaderProps> = ({ children }) => {
  return (
    <header className="app-header">
      <div className="header-brand">
        <LogoShield />
        <div className="header-brand-text">
          <div className="logo-mark">MORAN</div>
        </div>
      </div>
      <div className="header-content">{children}</div>
    </header>
  );
};
