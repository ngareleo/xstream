import { useEffect, useRef } from "react";
import { requestSubscription, useRelayEnvironment } from "react-relay";
import { graphql } from "react-relay";
import type { Disposable } from "relay-runtime";

import type { useJobSubscriptionQuery } from "../relay/__generated__/useJobSubscriptionQuery.graphql.js";

const JOB_SUBSCRIPTION = graphql`
  subscription useJobSubscriptionQuery($jobId: ID!) {
    transcodeJobUpdated(jobId: $jobId) {
      id
      status
      completedSegments
      totalSegments
    }
  }
`;

export interface JobProgress {
  status: string;
  completedSegments: number;
  totalSegments: number | null | undefined;
}

/**
 * Subscribes to transcodeJobUpdated for the given jobId and calls onProgress
 * on each update. Pass null to unsubscribe / disable.
 */
export function useJobSubscription(
  jobId: string | null,
  onProgress: (progress: JobProgress) => void
): void {
  const environment = useRelayEnvironment();
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  useEffect(() => {
    if (!jobId) return;

    let disposed = false;
    const subscription: Disposable = requestSubscription<useJobSubscriptionQuery>(environment, {
      subscription: JOB_SUBSCRIPTION,
      variables: { jobId },
      onNext: (response) => {
        if (disposed) return;
        const job = response?.transcodeJobUpdated;
        if (job) onProgressRef.current(job);
      },
      onError: () => {
        // Subscription errors are non-fatal — streaming continues independently.
      },
    });

    return () => {
      disposed = true;
      subscription.dispose();
    };
  }, [jobId, environment]);
}
