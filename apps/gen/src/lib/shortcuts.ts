/**
 * The one table behind every keyboard shortcut in the gen app: the global
 * handler (`useShortcuts`), the help overlay, and the command-palette labels
 * all read from here, so a binding can't be advertised without being handled.
 *
 * Bindings use Alt (Option) rather than Cmd/Ctrl: Cmd/Ctrl+T, N, F and 1-9 are
 * browser-reserved (new tab/window, find, tab switch) and can't be reliably
 * intercepted. Entries without an `action` are display-only — their key is
 * handled by the owning component (palette trigger, prompt bar).
 */
export type ShortcutAction =
  | "newGeneration"
  | "templates"
  | "history"
  | "inspector"
  | "fullscreen"
  | "stop"
  | "help"
  | "undo"
  | "redo";

export type ShortcutSection = "Navigation" | "Editing" | "Panels" | "General";

export interface ShortcutDef {
  id: string;
  label: string;
  section: ShortcutSection;
  /** Canonical key tokens: optional "Alt"/"Shift" modifiers, then the key. */
  keys: readonly string[];
  /** Present when the global handler owns this binding. */
  action?: ShortcutAction;
}

export const SHORTCUTS: readonly ShortcutDef[] = [
  { id: "palette", label: "Command palette", section: "Navigation", keys: ["Mod", "K"] },
  {
    id: "templates",
    label: "Templates gallery",
    section: "Navigation",
    keys: ["Alt", "Shift", "T"],
    action: "templates",
  },
  {
    id: "newGeneration",
    label: "New generation",
    section: "Navigation",
    keys: ["Alt", "Shift", "N"],
    action: "newGeneration",
  },
  { id: "send", label: "Send prompt", section: "Editing", keys: ["Enter"] },
  { id: "newline", label: "New line", section: "Editing", keys: ["Shift", "Enter"] },
  { id: "prevPrompt", label: "Previous prompt", section: "Editing", keys: ["↑"] },
  { id: "nextPrompt", label: "Next prompt", section: "Editing", keys: ["↓"] },
  {
    id: "undo",
    label: "Undo component refinement",
    section: "Editing",
    keys: ["Alt", "Z"],
    action: "undo",
  },
  {
    id: "redo",
    label: "Redo component refinement",
    section: "Editing",
    keys: ["Alt", "Shift", "Z"],
    action: "redo",
  },
  { id: "stop", label: "Stop generation", section: "Editing", keys: ["Esc"], action: "stop" },
  {
    id: "history",
    label: "Toggle history panel",
    section: "Panels",
    keys: ["Alt", "1"],
    action: "history",
  },
  {
    id: "inspector",
    label: "Toggle JSON inspector",
    section: "Panels",
    keys: ["Alt", "2"],
    action: "inspector",
  },
  {
    id: "fullscreen",
    label: "Toggle fullscreen",
    section: "Panels",
    keys: ["Alt", "Shift", "F"],
    action: "fullscreen",
  },
  { id: "help", label: "Show this help", section: "General", keys: ["?"], action: "help" },
];

export const SHORTCUT_SECTIONS: readonly ShortcutSection[] = [
  "Navigation",
  "Editing",
  "Panels",
  "General",
];

function isMac(): boolean {
  return typeof navigator !== "undefined" && /mac/i.test(navigator.userAgent);
}

/** Platform-specific display tokens for a shortcut (e.g. Alt -> Option glyph on macOS). */
export function displayKeys(def: ShortcutDef, mac: boolean = isMac()): string[] {
  return def.keys.map((k) => {
    if (k === "Mod") return mac ? "⌘" : "Ctrl";
    if (k === "Alt") return mac ? "⌥" : "Alt";
    if (k === "Shift" && mac) return "⇧";
    return k;
  });
}

/** Display tokens for the shortcut with this id (command-palette hints). */
export function shortcutKeys(id: string, mac?: boolean): string[] {
  const def = SHORTCUTS.find((s) => s.id === id);
  if (!def) throw new Error(`Unknown shortcut: ${id}`);
  return displayKeys(def, mac);
}

function mainKeyMatches(token: string, event: KeyboardEvent, usesAlt: boolean): boolean {
  if (token === "Esc") return event.key === "Escape";
  // With Alt held, macOS rewrites event.key (Option+F -> a symbol), so match the
  // physical key via event.code instead.
  if (usesAlt) return event.code === (/^\d$/.test(token) ? `Digit${token}` : `Key${token}`);
  return event.key === token;
}

/** The global-handler action a keydown maps to, or null. */
export function matchShortcut(event: KeyboardEvent): ShortcutAction | null {
  if (event.metaKey || event.ctrlKey) return null;
  for (const def of SHORTCUTS) {
    if (!def.action) continue;
    const token = def.keys[def.keys.length - 1];
    if (token === undefined) continue;
    const usesAlt = def.keys.includes("Alt");
    if (event.altKey !== usesAlt) continue;
    // Bare keys like "?" are shifted on many layouts, so only require Shift
    // to match when the binding is an Alt combo.
    if (usesAlt && event.shiftKey !== def.keys.includes("Shift")) continue;
    if (mainKeyMatches(token, event, usesAlt)) return def.action;
  }
  return null;
}
