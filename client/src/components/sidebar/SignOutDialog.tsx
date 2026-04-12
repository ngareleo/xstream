import { type FC } from "react";

import { IconSignOut, IconWarning } from "~/lib/icons.js";

import { useSidebarStyles } from "./Sidebar.styles.js";
import { strings } from "./SignOutDialog.strings.js";

export interface SignOutDialogProps {
  onCancel: () => void;
  onConfirm: () => void;
}

export const SignOutDialog: FC<SignOutDialogProps> = ({ onCancel, onConfirm }) => {
  const styles = useSidebarStyles();
  return (
    <div className={styles.dialogOverlay} onClick={onCancel}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.dialogIcon}>
          <IconWarning size={20} />
        </div>
        <div className={styles.dialogTitle}>{strings.title}</div>
        <div className={styles.dialogBody}>{strings.body}</div>
        <div className={styles.dialogActions}>
          <button className={styles.btnGhost} onClick={onCancel} type="button">
            {strings.cancel}
          </button>
          <button className={styles.btnDanger} onClick={onConfirm} type="button">
            <IconSignOut size={12} />
            {strings.signOut}
          </button>
        </div>
      </div>
    </div>
  );
};
