/**
 * Simulates an async data-fetch delay so the design lab can show realistic
 * loading states. In production these states are driven by Relay's Suspense
 * boundaries — the fallback renders until the query resolves.
 *
 * Usage:
 *   const loading = useSimulatedLoad();   // 700 ms default
 *   const loading = useSimulatedLoad(400);
 *   if (loading) return <PageSkeleton />;
 */
import { useState, useEffect } from "react";

export function useSimulatedLoad(delayMs = 700): boolean {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => setLoading(false), delayMs);
    return () => clearTimeout(id);
  }, [delayMs]);

  return loading;
}
