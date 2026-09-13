import { useCallback, useEffect, useReducer, useRef } from "react";

/**
 * Move focus to something that may not exist yet (architecture § `hooks/useFocusAfter.ts`).
 *
 * Pages call `focusAfter(target)` from the event handler that knows the outcome — a walk-in
 * created, a reservation cancelled — and the target is focused after the next commit in which it
 * can be found: a block still loading focuses when it renders; a target that never renders leaves
 * focus where it was until another request replaces it. One pending target at a time.
 */
export type FocusTarget =
  | { readonly kind: "element"; readonly element: HTMLElement }
  | { readonly kind: "testId"; readonly testId: string }
  /** The `PageHeader` h1, which carries `tabIndex={-1}` for this purpose. */
  | { readonly kind: "pageHeading" };

export interface FocusAfterApi {
  readonly focusAfter: (target: FocusTarget) => void;
}

function resolveTarget(target: FocusTarget): HTMLElement | null {
  switch (target.kind) {
    case "element":
      return target.element;
    case "testId":
      return document.querySelector<HTMLElement>(
        `[data-testid="${target.testId.replace(/["\\]/g, "\\$&")}"]`
      );
    case "pageHeading":
      return document.querySelector<HTMLElement>("h1");
  }
}

export function useFocusAfter(): FocusAfterApi {
  const pendingRef = useRef<FocusTarget | null>(null);
  // A request re-renders the owner so the effect below runs even when nothing else changed.
  const [, requestRender] = useReducer((count: number) => count + 1, 0);

  const focusAfter = useCallback((target: FocusTarget) => {
    pendingRef.current = target;
    requestRender();
  }, []);

  // After every commit: resolve the pending target, focus it once, forget it. No state is set here.
  useEffect(() => {
    const target = pendingRef.current;
    if (!target) return;
    const element = resolveTarget(target);
    if (!element) return;
    element.focus();
    pendingRef.current = null;
  });

  return { focusAfter };
}
