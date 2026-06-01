import { useNovaEventing } from "@nova/react";

import { createToastRequestedEvent, type ToastRequestedPayload } from "~/events/toast.events.js";

/**
 * Returns a `toast(payload)` that surfaces a transient notification via the
 * ToastProvider in AppShell. Uses Nova's `generateEvent` (no React event), so
 * it's safe from async callbacks like a mutation's `onCompleted`.
 */
export function useToast(): (payload: ToastRequestedPayload) => void {
  const { generateEvent } = useNovaEventing();
  return (payload) => {
    void generateEvent({ event: createToastRequestedEvent(payload) });
  };
}
