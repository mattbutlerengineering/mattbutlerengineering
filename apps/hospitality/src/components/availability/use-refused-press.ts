import { useEffect, useEffectEvent, useState } from "react";

export interface RefusedPressOptions {
  /** Reveal every problem: a refused save validates the whole form. */
  readonly onRefused?: () => void;
  /** Moves focus to the first problem. Called once the refusal has rendered, so the problem is there. */
  readonly focusFirstProblem: () => void;
}

/**
 * A save refused for a problem in the form: the problems are said, and focus goes to the first.
 * The editor page owns it, so every way to save refuses alike: `refuse` is the save bar's
 * `onRefused`, and what the leave prompt's Save calls when the draft has a problem.
 */
export function useRefusedPress(options: RefusedPressOptions) {
  const { onRefused } = options;
  // Counts refusals, so each one moves focus once and a plain re-render moves none.
  const [refusals, setRefusals] = useState(0);
  const focusProblem = useEffectEvent(options.focusFirstProblem);
  useEffect(() => {
    if (refusals > 0) focusProblem();
  }, [refusals]);
  const refuse = () => {
    onRefused?.();
    setRefusals((n) => n + 1);
  };
  return { refuse, refusals };
}
