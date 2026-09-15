import { useCallback, useState } from "react";

/**
 * One polite `role="status"` region per page and one way to speak into it (architecture
 * § "Outcomes are spoken and focused by the page"; ux.md § `role=status` sentences).
 *
 * Pages call `announce()` from event handlers; `LiveStatus` renders the result. `seq` increments
 * on every call so the same sentence twice still remounts the span and is announced again.
 */
export interface StatusMessage {
  readonly seq: number;
  readonly text: string;
}

export interface StatusMessageApi {
  readonly status: StatusMessage | null;
  readonly announce: (text: string) => void;
}

export function useStatusMessage(): StatusMessageApi {
  const [status, setStatus] = useState<StatusMessage | null>(null);

  // Functional update: two calls in one tick each see the previous seq and the last text wins.
  const announce = useCallback((text: string) => {
    setStatus((previous) => ({ seq: (previous?.seq ?? 0) + 1, text }));
  }, []);

  return { status, announce };
}
