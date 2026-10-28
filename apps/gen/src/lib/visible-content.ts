import type { Spec } from "@json-render/react";

/**
 * Layout shells with no leaves (a grid of empty Stacks) render as a blank
 * preview. Text, controls, charts and pictures count as something to see.
 * A Card counts only when it has a title or a visible descendant.
 */

const LAYOUT = new Set(["Stack", "Divider", "AspectRatio", "ScrollArea"]);

interface GenElement {
  type?: string;
  props?: Record<string, unknown>;
  children?: string[];
  slots?: Record<string, string[]>;
}

function childKeys(element: GenElement): string[] {
  const keys = [...(element.children ?? [])];
  for (const slot of Object.values(element.slots ?? {})) {
    if (!Array.isArray(slot)) continue;
    for (const key of slot) if (typeof key === "string") keys.push(key);
  }
  return keys;
}

function cardHasWords(element: GenElement): boolean {
  const props = element.props ?? {};
  return [props.title, props.subtitle, props.children].some(
    (value) => typeof value === "string" && value.trim() !== ""
  );
}

export function specHasVisibleContent(spec: Spec | null): boolean {
  if (!spec?.root || !spec.elements) return false;
  const elements = spec.elements as Record<string, GenElement>;
  const seen = new Set<string>();

  const walk = (key: string): boolean => {
    if (seen.has(key)) return false;
    const element = elements[key];
    if (!element?.type) return false;
    seen.add(key);
    if (element.type === "Card") {
      if (cardHasWords(element)) return true;
      return childKeys(element).some(walk);
    }
    if (!LAYOUT.has(element.type)) return true;
    return childKeys(element).some(walk);
  };

  return walk(spec.root);
}
