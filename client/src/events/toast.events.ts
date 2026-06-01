import type { EventWrapper, NovaEvent } from "@nova/types";

/** Cross-cutting "show a transient notification" domain — multiple emitters
 *  (any component), one consumer (ToastProvider in AppShell). */
export const TOAST_ORIGINATOR = "toast";

export const ToastEventTypes = {
  REQUESTED: "Requested",
} as const;

export type ToastVariant = "success" | "error" | "info";

export interface ToastRequestedPayload {
  variant: ToastVariant;
  message: string;
}

export function createToastRequestedEvent(
  payload: ToastRequestedPayload
): NovaEvent<ToastRequestedPayload> {
  return {
    originator: TOAST_ORIGINATOR,
    type: ToastEventTypes.REQUESTED,
    data: () => payload,
  };
}

export function isToastRequestedEvent(wrapper: EventWrapper): boolean {
  return (
    wrapper.event.originator === TOAST_ORIGINATOR &&
    wrapper.event.type === ToastEventTypes.REQUESTED
  );
}

export function getToastPayload(wrapper: EventWrapper): ToastRequestedPayload {
  // `NovaEvent.data` is optional in the type; our factory always supplies it.
  const payload = wrapper.event.data?.() as ToastRequestedPayload | undefined;
  return payload ?? { variant: "info", message: "" };
}
