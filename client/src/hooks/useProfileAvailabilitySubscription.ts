import { useMemo, useRef } from "react";
import { graphql, useSubscription } from "react-relay";

import type { useProfileAvailabilitySubscriptionQuery } from "~/relay/__generated__/useProfileAvailabilitySubscriptionQuery.graphql.js";

const AVAILABILITY_SUBSCRIPTION = graphql`
  subscription useProfileAvailabilitySubscriptionQuery {
    profileAvailabilityUpdated {
      libraryId
      status
      lastSeenAt
    }
  }
`;

export type ProfileStatus = "ONLINE" | "OFFLINE" | "UNKNOWN";

export interface ProfileAvailabilitySnapshot {
  libraryId: string;
  status: ProfileStatus;
  lastSeenAt: string | null;
}

/** Subscribe to profileAvailabilityUpdated; calls `onUpdate` per library
 *  (initial DB seed on connect, then one frame per flip). Pass a stable callback. */
export function useProfileAvailabilitySubscription(
  onUpdate: (snap: ProfileAvailabilitySnapshot) => void
): void {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const config = useMemo(
    () => ({
      subscription: AVAILABILITY_SUBSCRIPTION,
      variables: {},
      onNext: (
        response: useProfileAvailabilitySubscriptionQuery["response"] | null | undefined
      ) => {
        const snap = response?.profileAvailabilityUpdated;
        if (!snap) return;
        // `status` is a GraphQL enum; the generated union includes
        // "%future added value" — coerce anything unexpected to UNKNOWN.
        const status: ProfileStatus =
          snap.status === "ONLINE" || snap.status === "OFFLINE" ? snap.status : "UNKNOWN";
        onUpdateRef.current({
          libraryId: snap.libraryId,
          status,
          lastSeenAt: snap.lastSeenAt ?? null,
        });
      },
      onError: () => {},
    }),
    []
  );

  useSubscription<useProfileAvailabilitySubscriptionQuery>(config);
}
