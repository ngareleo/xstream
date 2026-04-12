import type { EventWrapper, NovaEvent } from "@nova/types";

export const LINK_SEARCH_ORIGINATOR = "LinkSearch";

export const LinkSearchEventTypes = {
  CANCELLED: "Cancelled",
} as const;

export function createLinkSearchCancelledEvent(): NovaEvent<undefined> {
  return {
    originator: LINK_SEARCH_ORIGINATOR,
    type: LinkSearchEventTypes.CANCELLED,
    data: () => undefined,
  };
}

export function isLinkSearchCancelledEvent(wrapper: EventWrapper): boolean {
  return (
    wrapper.event.originator === LINK_SEARCH_ORIGINATOR &&
    wrapper.event.type === LinkSearchEventTypes.CANCELLED
  );
}
