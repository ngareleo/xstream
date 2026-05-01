import { type FC, type ReactNode } from "react";
import { AppHeader } from "../AppHeader/AppHeader.js";
import { useAppShellStyles } from "./AppShell.styles.js";

export const AppShell: FC<{ children: ReactNode }> = ({ children }) => {
  const s = useAppShellStyles();
  return (
    <div className={s.shell}>
      <AppHeader />
      <main className={s.main}>{children}</main>
    </div>
  );
};
