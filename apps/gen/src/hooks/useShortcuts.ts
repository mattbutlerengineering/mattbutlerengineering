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
 * while idle) is left alone so the key keeps its default behaviour. Every
 * shortcut except Escape (stop) is ignored while typing in a form field.
 */
export function useShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // A palette, dialog or fullscreen layer that consumed the key has preventDefault()ed it.
      if (e.defaultPrevented) return;
      const action = matchShortcut(e);
      if (!action) return;
      const handler = handlers[action];
      if (!handler) return;
      // Only Escape (stop) works while typing; Option+digit etc. produce characters.
      if (action !== "stop" && isTypingTarget(e.target)) return;
      e.preventDefault();
      handler();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
