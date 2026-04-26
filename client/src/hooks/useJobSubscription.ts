import { useMemo, useRef } from "react";
import { graphql, useSubscription } from "react-relay";

import type { useJobSubscriptionQuery } from "~/relay/__generated__/useJobSubscriptionQuery.graphql.js";

const JOB_SUBSCRIPTION = graphql`
  subscription useJobSubscriptionQuery($jobId: ID!) {
    transcodeJobUpdated(jobId: $jobId) {
      id
      status
      completedSegments
      totalSegments
      errorCode
      error
    }
  }
`;

export interface JobProgress {
  status: string;
  completedSegments: number;
  totalSegments: number | null | undefined;
  /** Set when status === "ERROR" — typed code for the underlying failure
   * (PROBE_FAILED, ENCODE_FAILED, …). Used by VideoPlayer to fail fast with
   * a meaningful message instead of waiting for the 90 s stream idle timeout. */
  errorCode: string | null | undefined;
  error: string | null | undefined;
}

/**
 * Subscribes to transcodeJobUpdated for the given jobId and calls onProgress
 * on each update. Pass null to unsubscribe / disable.
 */
export function useJobSubscription(
  jobId: string | null,
  onProgress: (progress: JobProgress) => void
): void {
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  const config = useMemo(
    () => ({
      subscription: JOB_SUBSCRIPTION,
      variables: { jobId: jobId ?? "" },
      onNext: (response: useJobSubscriptionQuery["response"] | null | undefined) => {
        if (!jobId) return;
        const job = response?.transcodeJobUpdated;
        if (job) onProgressRef.current(job);
      },
      onError: () => {},
    }),
    [jobId]
  );

  useSubscription<useJobSubscriptionQuery>(config);
}
