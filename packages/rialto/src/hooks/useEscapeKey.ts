import { useEffect } from "react";

/**
 * Attaches a document-level Escape keydown listener while `enabled` is true.
 * Cleans up automatically when disabled or unmounted.
 *
 * All 8 overlay components (Dialog, Drawer, Popover, DropdownMenu, CommandPalette,
 * Tooltip, ContextMenu, HoverCard) consume this hook instead of each maintaining
 * their own inline keydown listener.
 *
 * @param onClose - Callback invoked when Escape is pressed.
 * @param enabled - Whether the listener is active (typically matches overlay open state).
 *
 * @example
 * useEscapeKey(onClose, open);
 */
export function useEscapeKey(onClose: () => void, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [enabled, onClose]);
}
