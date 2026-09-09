import { useEffect, useState } from "react";

const DEFAULT_INTERVAL_MS = 60_000;

/**
 * Re-renders the caller every `intervalMs` with a fresh `Date`.
 *
 * Cleans up on unmount and restarts when `intervalMs` changes. No visibility
 * pause and no drift correction — one tick of staleness is the accepted
 * contract for a once-a-minute fact.
 */
export function useNow(intervalMs = DEFAULT_INTERVAL_MS): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);

  return now;
}
