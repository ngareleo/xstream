import { mergeClasses } from "@griffel/react";
import { type FC } from "react";
import { Outlet } from "react-router-dom";

import { Logo02 } from "~/components/logo/Logo02.js";

import { strings } from "./AuthLayout.strings.js";
import { heroSrc, useAuthLayoutStyles } from "./AuthLayout.styles.js";

export const AuthLayout: FC = () => {
  const styles = useAuthLayoutStyles();

  return (
    <div className={styles.shell}>
      <img className={styles.hero} src={heroSrc} alt={strings.heroAlt} />
      <div className={styles.scrim} />
      <div className={mergeClasses("grain-layer", styles.grain)} />

      <div className={styles.brand}>
        <Logo02 size={28} showWordmark={false} />
        <div className={styles.wordmark}>{strings.wordmark}</div>
      </div>

      <div className={styles.panelWrap}>
        <div className={styles.panel}>
          <Outlet />
        </div>
      </div>
    </div>
  );
};
