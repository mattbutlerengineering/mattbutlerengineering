import { useCallback, useEffect, useReducer, useRef } from "react";

/**
 * Move focus to something that may not exist yet (architecture § `hooks/useFocusAfter.ts`).
 *
 * Pages call `focusAfter(target)` from the event handler that knows the outcome — a walk-in
 * created, a reservation cancelled — and the target is focused after the next commit in which it
 * can be found: a block still loading focuses when it renders; a target that does not render soon
 * leaves focus where it was, and the request is cancelled by anything the Host does after it. One
 * pending target at a time.
 */
export type FocusTarget =
  | { readonly kind: "element"; readonly element: HTMLElement }
  | { readonly kind: "testId"; readonly testId: string }
  /** The first enabled control inside the `data-testid` container, a dismiss control excepted. */
  | { readonly kind: "firstIn"; readonly testId: string }
  /** The `PageHeader` h1, which carries `tabIndex={-1}` for this purpose. */
  | { readonly kind: "pageHeading" };

export interface FocusOptions {
  /**
   * Drop the request if, once its target is found, a modal dialog covers it. For a response that may
   * land late: keys on a covered target act behind the dialog on top. Judged after the commit, so a
   * dialog closing with the request does not count.
   */
  readonly unlessCovered?: boolean;
}

export const UNLESS_COVERED: FocusOptions = { unlessCovered: true };

export interface FocusAfterApi {
  readonly focusAfter: (target: FocusTarget, options?: FocusOptions) => void;
}

/**
 * A request still unmet after this may no longer take focus from the Host, who is doing something
 * else by now. While focus is still loose it stands: landing late beats leaving focus nowhere.
 */
const PENDING_TTL_MS = 10_000;

/** The Host doing something else. `popstate` is browser Back, which raises neither of the others. */
const HOST_ACTIONS = ["pointerdown", "keydown", "popstate"] as const;

const FIRST_CONTROL =
  'button:not(:disabled):not([data-focus-trap-skip-initial]), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

const byTestId = (testId: string) =>
  document.querySelector<HTMLElement>(`[data-testid="${testId.replace(/["\\]/g, "\\$&")}"]`);

function resolveTarget(target: FocusTarget): HTMLElement | null {
  switch (target.kind) {
    case "element":
      return target.element;
    case "testId":
      return byTestId(target.testId);
    case "firstIn":
      return byTestId(target.testId)?.querySelector<HTMLElement>(FIRST_CONTROL) ?? null;
    case "pageHeading":
      return document.querySelector<HTMLElement>("h1");
  }
}

const MODAL_DIALOG = '[role="dialog"][aria-modal="true"]';

/**
 * True when a modal dialog sits above `element`, so keys on it would act behind that dialog. Outside
 * any dialog, every open one is above it. Inside one, those above it are the dialogs later in the
 * document (the page renders them in stacking order) and whichever other one holds focus (the command
 * palette, which comes earlier in the document but stacks over everything). A panel inside an `inert`
 * subtree is on its way out and covers nothing.
 */
export function isCoveredByDialog(element: Element | null): boolean {
  const own = element?.closest(MODAL_DIALOG) ?? null;
  return Array.from(document.querySelectorAll(MODAL_DIALOG)).some((dialog) => {
    if (dialog === own || dialog.closest("[inert]")) return false;
    if (!own) return true;
    const later = own.compareDocumentPosition(dialog) & Node.DOCUMENT_POSITION_FOLLOWING;
    return Boolean(later) || dialog.contains(document.activeElement);
  });
}

export function useFocusAfter(): FocusAfterApi {
  const pendingRef = useRef<{
    target: FocusTarget;
    options?: FocusOptions;
    requestedAt: number;
  } | null>(null);
  // A request re-renders the owner so the effect below runs even when nothing else changed.
  const [, requestRender] = useReducer((count: number) => count + 1, 0);

  const focusAfter = useCallback((target: FocusTarget, options?: FocusOptions) => {
    pendingRef.current = { target, options, requestedAt: performance.now() };
    requestRender();
  }, []);

  // Capture, on window: a handler that stops propagation must not hide the action from this.
  useEffect(() => {
    const cancel = () => {
      pendingRef.current = null;
    };
    HOST_ACTIONS.forEach((type) => window.addEventListener(type, cancel, true));
    return () => HOST_ACTIONS.forEach((type) => window.removeEventListener(type, cancel, true));
  }, []);

  // After every commit: resolve the pending target, focus it once, forget it. No state is set here.
  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    const focusIsLoose = !document.activeElement || document.activeElement === document.body;
    if (performance.now() - pending.requestedAt > PENDING_TTL_MS && !focusIsLoose) {
      pendingRef.current = null;
      return;
    }
    const element = resolveTarget(pending.target);
    if (!element) return;
    pendingRef.current = null;
    if (pending.options?.unlessCovered && isCoveredByDialog(element)) return;
    element.focus();
  });

  return { focusAfter };
}
