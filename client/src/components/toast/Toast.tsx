import { mergeClasses } from "@griffel/react";
import { NovaEventingInterceptor } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import { type FC, type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import {
  getToastPayload,
  isToastRequestedEvent,
  type ToastVariant,
} from "~/events/toast.events.js";

import { strings } from "./Toast.strings.js";
import { useToastStyles } from "./Toast.styles.js";

const AUTO_DISMISS_MS = 4000;

const GLYPH: Record<ToastVariant, string> = {
  success: "✓",
  error: "!",
  info: "i",
};

interface ActiveToast {
  id: number;
  variant: ToastVariant;
  message: string;
}

/** Mounts the toast interceptor + auto-dismissing viewport (the sole consumer
 *  of toast events). See docs/code-style/Client-Conventions/02-Nova-Eventing.md. */
export const ToastProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const nextId = useRef(0);

  // Stable so each toast's auto-dismiss timer isn't reset every time the
  // stack re-renders (e.g. when another toast is added).
  const dismiss = useCallback((id: number): void => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Nova invokes the interceptor with fresh closure state, so it needs no
  // useCallback (the eventing rule's reference-stability guarantee).
  const interceptor = async (wrapper: EventWrapper): Promise<EventWrapper> => {
    if (isToastRequestedEvent(wrapper)) {
      const { variant, message } = getToastPayload(wrapper);
      const id = (nextId.current += 1);
      setToasts((prev) => [...prev, { id, variant, message }]);
    }
    return wrapper;
  };

  return (
    <NovaEventingInterceptor interceptor={interceptor}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </NovaEventingInterceptor>
  );
};

const ToastViewport: FC<{
  toasts: ReadonlyArray<ActiveToast>;
  onDismiss: (id: number) => void;
}> = ({ toasts, onDismiss }) => {
  const styles = useToastStyles();
  if (toasts.length === 0) return null;
  return (
    <div className={styles.viewport} role="region" aria-label={strings.regionAriaLabel}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

const ToastItem: FC<{ toast: ActiveToast; onDismiss: (id: number) => void }> = ({
  toast,
  onDismiss,
}) => {
  const styles = useToastStyles();

  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const variantToast =
    toast.variant === "success"
      ? styles.toastSuccess
      : toast.variant === "error"
        ? styles.toastError
        : styles.toastInfo;
  const variantGlyph =
    toast.variant === "success"
      ? styles.glyphSuccess
      : toast.variant === "error"
        ? styles.glyphError
        : styles.glyphInfo;

  return (
    <div
      className={mergeClasses(styles.toast, variantToast)}
      role={toast.variant === "error" ? "alert" : "status"}
    >
      <span className={mergeClasses(styles.glyph, variantGlyph)} aria-hidden="true">
        {GLYPH[toast.variant]}
      </span>
      <span className={styles.message}>{toast.message}</span>
      <button
        type="button"
        className={styles.dismiss}
        aria-label={strings.dismissAriaLabel}
        onClick={() => onDismiss(toast.id)}
      >
        ×
      </button>
    </div>
  );
};
