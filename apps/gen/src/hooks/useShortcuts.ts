import { useEffect } from "react";
import { matchShortcut } from "../lib/shortcuts.js";
import type { ShortcutAction } from "../lib/shortcuts.js";

export type ShortcutHandlers = Partial<Record<ShortcutAction, () => void>>;

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  const tag = el?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!el?.isContentEditable;
}

/**
 * Installs the single global keydown listener that dispatches the shortcut
 * table (`lib/shortcuts`) to `handlers`. An action with no handler (e.g. Stop
 * while idle) is left alone so the key keeps its default behaviour. The bare
 * "?" help key is ignored while typing in a form field.
 */
export function useShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const action = matchShortcut(e);
      if (!action) return;
      const handler = handlers[action];
      if (!handler) return;
      if (action === "help" && isTypingTarget(e.target)) return;
      e.preventDefault();
      handler();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
