/**
 * Simulates an async fetch so the design lab shows realistic loading states.
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
