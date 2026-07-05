import { useEffect, type RefObject } from "react";

/** Options for {@link useDismiss}. */
export interface UseDismissOptions {
  /** Whether the outside-press listener is active (typically the overlay's open state). */
  enabled: boolean;
}

/**
 * Attaches a document-level `mousedown` listener while `enabled` is true and
 * invokes `onClose` when a press lands outside the element referenced by `ref`.
 * Cleans up automatically when disabled or unmounted.
 *
 * Consolidates the click-outside dismiss pattern (mousedown listener +
 * `ref.contains(target)` guard + cleanup) that the Popover, DropdownMenu,
 * ContextMenu, and NavigationMenu overlays each maintained inline — a sibling of
 * the existing `useEscapeKey` / `useReturnFocus` overlay hooks.
 *
 * RIALTO RULE: no setState in this hook — it only wires the listener.
 *
 * @param ref - Ref to the overlay root; a press inside it (or its descendants) is ignored.
 * @param onClose - Callback invoked on an outside press.
 * @param options - Behaviour flags; `enabled` gates the listener.
 *
 * @example
 * useDismiss(wrapperRef, close, { enabled: open });
 */
export function useDismiss<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onClose: () => void,
  { enabled }: UseDismissOptions
): void {
  useEffect(() => {
    if (!enabled) return;

    const handleMouseDown = (e: MouseEvent) => {
      const el = ref.current;
      if (el && !el.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [enabled, onClose, ref]);
}
