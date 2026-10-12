import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * Module-level overlay stack. Each enabled `useEscapeKey` caller pushes a unique token on open
 * and removes it on close/unmount, so the last token is always the topmost (most recently
 * opened) overlay. Only that layer handles Escape.
 */
const overlayStack: symbol[] = [];

/**
 * Attaches a document-level Escape keydown listener while `enabled` is true.
 * Cleans up automatically when disabled or unmounted.
 *
 * All 8 overlay components (Dialog, Drawer, Popover, DropdownMenu, CommandPalette,
 * Tooltip, ContextMenu, HoverCard) consume this hook instead of each maintaining
 * their own inline keydown listener.
 *
 * Overlays form a stack: when several are open at once (a Dialog over a Drawer, a Popover
 * inside a Dialog) one Escape closes only the topmost — the most recently opened — and the
 * next Escape reaches the layer beneath.
 *
 * Also ignores an Escape whose default was already prevented — the standard "already consumed"
 * signal — so a listbox nested in a Dialog/Drawer closes on the first Escape and the overlay
 * on the second.
 *
 * @param onClose - Callback invoked when Escape is pressed.
 * @param enabled - Whether the listener is active (typically matches overlay open state).
 *
 * @example
 * useEscapeKey(onClose, open);
 */
export function useEscapeKey(onClose: () => void, enabled: boolean): void {
  // Latest callback lives in a ref so an inline `onClose` (new identity every render) never
  // re-registers the layer — re-registering would move it to the top of the stack.
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!enabled) return;

    const token = Symbol("overlay");
    overlayStack.push(token);

    const handler = (e: KeyboardEvent) => {
      // An Escape a nested widget already consumed (a combobox closing its listbox calls
      // preventDefault, as Autocomplete/Combobox/useCombobox do) must not also close the overlay.
      if (e.defaultPrevented) return;
      if (e.key !== "Escape") return;
      if (overlayStack[overlayStack.length - 1] !== token) return;
      onCloseRef.current();
    };

    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      const index = overlayStack.indexOf(token);
      if (index !== -1) overlayStack.splice(index, 1);
    };
  }, [enabled]);
}
