import { useNovaEventing } from "@nova/react";

import { createToastRequestedEvent, type ToastRequestedPayload } from "~/events/toast.events.js";

/** Returns a `toast(payload)` that surfaces a transient notification via the ToastProvider. */
export function useToast(): (payload: ToastRequestedPayload) => void {
  const { generateEvent } = useNovaEventing();
  return (payload) => {
    void generateEvent({ event: createToastRequestedEvent(payload) });
  };
}
