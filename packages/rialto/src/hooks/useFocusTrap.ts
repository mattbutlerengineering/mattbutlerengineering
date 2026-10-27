import { useEffect, type RefObject } from "react";

/**
 * Selector for all keyboard-focusable elements.
 * Used by Dialog, Drawer, and CommandPalette to query trap candidates.
 */
export const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Attribute a panel can put on an element (e.g. a dismiss/Close button) to
 * exclude it from the *initial* focus target. It remains reachable via Tab.
 */
export const FOCUS_TRAP_SKIP_INITIAL_ATTR = "data-focus-trap-skip-initial";

export interface UseFocusTrapOptions {
  /** Element to focus when the trap activates, overriding the default candidate. */
  initialFocus?: RefObject<HTMLElement | null>;
}

function resolveInitialFocus(
  focusable: NodeListOf<HTMLElement>,
  first: HTMLElement | undefined,
  initialFocus?: RefObject<HTMLElement | null>
): HTMLElement | undefined {
  if (initialFocus?.current) return initialFocus.current;
  const defaultTarget = Array.from(focusable).find(
    (el) => !el.hasAttribute(FOCUS_TRAP_SKIP_INITIAL_ATTR)
  );
  return defaultTarget ?? first;
}

/**
 * Panels with an active trap, in activation order. The last entry is the
 * topmost trap; only it handles Tab (a dialog over a drawer, a palette over a dialog).
 */
const activePanels: HTMLElement[] = [];

/**
 * Traps keyboard focus inside a panel element while `enabled` is true.
 *
 * On enable: focuses `options.initialFocus` if provided, else the first
 * focusable descendant that isn't marked `data-focus-trap-skip-initial`
 * (e.g. a dismiss/Close button), falling back to the first focusable element.
 * Tab at last element: wraps to first.
 * Shift+Tab at first element: wraps to last.
 * When several traps are active, only the most recently enabled one acts.
 * On disable / unmount: removes all listeners (no cleanup side-effects on the caller).
 *
 * RIALTO RULE: no setState in this hook — all behavior is imperative (focus + listeners).
 *
 * @example
 * const panelRef = useRef<HTMLDivElement>(null);
 * useFocusTrap(panelRef, isOpen);
 */
export function useFocusTrap(
  panelRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  options?: UseFocusTrapOptions
): void {
  const initialFocus = options?.initialFocus;

  useEffect(() => {
    if (!enabled) return;

    const panel = panelRef.current;
    if (!panel) return;

    const initialCandidates = panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    resolveInitialFocus(initialCandidates, initialCandidates[0], initialFocus)?.focus();

    activePanels.push(panel);

    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      // Only the topmost trap acts, so stacked panels don't fight over focus.
      if (panel !== activePanels[activePanels.length - 1]) return;
      // Re-query on every Tab: panels add/remove/disable controls after open,
      // so cached ends go stale and let focus escape.
      const focusable = panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (!active || !panel.contains(active)) {
        // Focus already escaped the panel: pull it back in.
        e.preventDefault();
        (e.shiftKey ? last : first)?.focus();
        return;
      }
      if (e.shiftKey) {
        if (active === first) {
          e.preventDefault();
          last?.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      const index = activePanels.lastIndexOf(panel);
      if (index !== -1) activePanels.splice(index, 1);
    };
  }, [enabled, panelRef, initialFocus]);
}
