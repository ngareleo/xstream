import { useNovaEventing } from "@nova/react";

import { createToastRequestedEvent, type ToastRequestedPayload } from "~/events/toast.events.js";

/**
 * Returns a `toast(payload)` function that surfaces a transient notification
 * via the ToastProvider mounted in AppShell. Uses Nova's `generateEvent`
 * (the no-React-SyntheticEvent path), so it's safe to call from async
 * callbacks like a Relay mutation's `onCompleted`. `generateEvent` is a
 * stable reference from the provider, so the returned function is stable too.
 */
export function useToast(): (payload: ToastRequestedPayload) => void {
  const { generateEvent } = useNovaEventing();
  return (payload) => {
    void generateEvent({ event: createToastRequestedEvent(payload) });
  };
}
