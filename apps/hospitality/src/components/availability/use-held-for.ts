import { useEffect, useState } from "react";

/**
 * True once `active` has stayed true for `ms`: for a control only worth offering when something
 * has gone on too long, so it does not flash in and out during the normal case.
 */
export function useHeldFor(active: boolean, ms: number): boolean {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setTimeout(() => setElapsed(true), ms);
    return () => {
      clearTimeout(timer);
      setElapsed(false);
    };
  }, [active, ms]);
  return active && elapsed;
}
