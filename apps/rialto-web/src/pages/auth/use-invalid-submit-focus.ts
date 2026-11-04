import { useCallback, useEffect, useState, type RefObject } from "react";

/** First control marked invalid. Document order is the field order. */
const INVALID_CONTROL_SELECTOR =
  "[aria-invalid='true']:not([disabled]):not([aria-disabled='true'])";

/**
 * Focus the first invalid control after a failed submit.
 *
 * The attempt counter starts at 0, so the effect never moves focus on mount.
 * Call the returned function on every invalid submit — including a repeat
 * that does not change the error flags — so focus returns to the field even
 * when the user has tabbed back to the submit button. Blur validation must
 * not call it; that would yank focus back to a field the user just left.
 *
 * The lookup runs after paint so `aria-invalid` is already on the control.
 * `fallbackSelector` covers a control that blocks submit without
 * `aria-invalid` (the sign-up terms checkbox).
 */
export function useInvalidSubmitFocus(
  formRef: RefObject<HTMLFormElement | null>,
  fallbackSelector?: string
): () => void {
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (attempt === 0) return;
    const form = formRef.current;
    if (!form) return;
    const invalid = form.querySelector<HTMLElement>(INVALID_CONTROL_SELECTOR);
    const fallback = fallbackSelector
      ? form.querySelector<HTMLElement>(`${fallbackSelector}:not([disabled])`)
      : null;
    (invalid ?? fallback)?.focus();
  }, [attempt, fallbackSelector, formRef]);

  return useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);
}
