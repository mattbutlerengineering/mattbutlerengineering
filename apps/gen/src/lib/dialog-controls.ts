import type { Spec } from "@json-render/react";

/**
 * The playground has no state store, and the model is told to put literal
 * values in props. A "button opens a dialog" prompt therefore comes back with
 * `open: true` on every Dialog and buttons that emit `press` into nothing.
 * Both dialogs render open, and Close / Esc / the ✕ do not change `open`.
 *
 * This plan is the binding the spec cannot express: which button opens or
 * closes which dialog, and that a dialog with an opener starts closed.
 */

export interface DialogControl {
  initialOpen: boolean;
}

export interface ButtonControl {
  kind: "open" | "close";
  dialogKey: string;
}

export interface DialogPlan {
  dialogs: Record<string, DialogControl>;
  buttons: Record<string, ButtonControl>;
}

interface GenElement {
  type?: string;
  props?: Record<string, unknown>;
  children?: string[];
  slots?: Record<string, string[]>;
}

const EMPTY: DialogPlan = { dialogs: {}, buttons: {} };

function elementsOf(spec: Spec | null): Record<string, GenElement> | null {
  if (!spec?.root || !spec.elements) return null;
  return spec.elements as Record<string, GenElement>;
}

function childKeys(element: GenElement | undefined): string[] {
  if (!element) return [];
  const keys = [...(element.children ?? [])];
  for (const slot of Object.values(element.slots ?? {})) {
    if (!Array.isArray(slot)) continue;
    for (const key of slot) if (typeof key === "string") keys.push(key);
  }
  return keys;
}

function labelOf(element: GenElement): string {
  const props = element.props ?? {};
  return [props.label, props.children, props["aria-label"], props.text]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
}

function isButton(element: GenElement | undefined): boolean {
  return element?.type === "Button" || element?.type === "IconButton";
}

function wantsClose(label: string): boolean {
  return /\bclose\b/i.test(label);
}

function wantsOpen(label: string): boolean {
  return /\bopen\b/i.test(label);
}

/** First dialog at or under `key`, in tree order. */
function findDialog(elements: Record<string, GenElement>, key: string): string | null {
  const element = elements[key];
  if (!element) return null;
  if (element.type === "Dialog") return key;
  for (const child of childKeys(element)) {
    const found = findDialog(elements, child);
    if (found) return found;
  }
  return null;
}

export function planDialogControls(spec: Spec | null): DialogPlan {
  const elements = elementsOf(spec);
  if (!elements || !spec?.root) return EMPTY;

  const parent = new Map<string, string>();
  const walk = (key: string) => {
    for (const child of childKeys(elements[key])) {
      if (parent.has(child)) continue;
      parent.set(child, key);
      walk(child);
    }
  };
  walk(spec.root);

  const nearestDialog = (key: string): string | null => {
    let current = parent.get(key);
    while (current) {
      if (elements[current]?.type === "Dialog") return current;
      current = parent.get(current);
    }
    return null;
  };

  const buttons: Record<string, ButtonControl> = {};
  const opened = new Set<string>();

  for (const [key, element] of Object.entries(elements)) {
    if (!isButton(element)) continue;
    const label = labelOf(element);
    const ancestor = nearestDialog(key);
    if (wantsClose(label) && ancestor) {
      buttons[key] = { kind: "close", dialogKey: ancestor };
      continue;
    }
    const parentKey = parent.get(key);
    const siblings = childKeys(parentKey ? elements[parentKey] : undefined);
    const index = siblings.indexOf(key);
    let target: string | null = null;
    if (wantsOpen(label)) {
      for (const sibling of siblings.slice(index + 1)) {
        target = findDialog(elements, sibling);
        if (target) break;
      }
    } else if (index >= 0) {
      const next = siblings[index + 1];
      if (next && elements[next]?.type === "Dialog") target = next;
    }
    if (target) {
      buttons[key] = { kind: "open", dialogKey: target };
      opened.add(target);
    }
  }

  const dialogs: Record<string, DialogControl> = {};
  for (const [key, element] of Object.entries(elements)) {
    if (element.type !== "Dialog") continue;
    const literalOpen = element.props?.open === true;
    dialogs[key] = { initialOpen: opened.has(key) ? false : literalOpen };
  }

  return { dialogs, buttons };
}
