import type { Spec } from "@json-render/react";

type Elements = Spec["elements"];

export type SpecError = "unknown-key" | "root-mismatch" | "key-collision";
export type SpecResult = { ok: true; spec: Spec } | { ok: false; error: SpecError };

export interface SpecDiff {
  parentId: string | null;
  /** The element key whose subtree changed. */
  path: string;
  /** Subtree rooted at `path`, before the change. */
  before: Spec;
  /** Subtree rooted at `path`, after the change. */
  after: Spec;
}

function childrenOf(elements: Elements, key: string): string[] {
  return elements[key]?.children ?? [];
}

/** The key plus all transitive descendants; empty when the key is unknown. Cycle-safe. */
export function subtreeKeys(spec: Spec, key: string): string[] {
  if (!(key in spec.elements)) return [];
  const seen = new Set<string>();
  const stack = [key];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (seen.has(current) || !(current in spec.elements)) continue;
    seen.add(current);
    stack.push(...childrenOf(spec.elements, current));
  }
  return Array.from(seen);
}

export function extractSubtree(spec: Spec, key: string): Spec | null {
  const keys = subtreeKeys(spec, key);
  if (keys.length === 0) return null;
  const elements: Elements = {};
  for (const k of keys) {
    const element = spec.elements[k];
    if (element) elements[k] = element;
  }
  return { root: key, elements };
}

/** Root-to-parent chain of `{ key, type }`; empty for the root or an unknown key. */
export function ancestorChain(spec: Spec, key: string): { key: string; type: string }[] {
  const seen = new Set<string>();
  const walk = (current: string, trail: string[]): string[] | null => {
    if (current === key) return trail;
    if (seen.has(current) || !(current in spec.elements)) return null;
    seen.add(current);
    for (const child of childrenOf(spec.elements, current)) {
      const found = walk(child, [...trail, current]);
      if (found) return found;
    }
    return null;
  };
  const trail = walk(spec.root, []) ?? [];
  return trail.map((k) => ({ key: k, type: spec.elements[k]?.type ?? "" }));
}

/** Returns a new spec with the subtree at `key` replaced; never mutates the inputs. */
export function spliceSubtree(spec: Spec, key: string, replacement: Spec): SpecResult {
  if (!(key in spec.elements)) return { ok: false, error: "unknown-key" };
  if (replacement.root !== key || !(key in replacement.elements)) {
    return { ok: false, error: "root-mismatch" };
  }
  const removed = new Set(subtreeKeys(spec, key));
  for (const k of Object.keys(replacement.elements)) {
    if (k in spec.elements && !removed.has(k)) return { ok: false, error: "key-collision" };
  }
  const elements: Elements = {};
  for (const [k, element] of Object.entries(spec.elements)) {
    if (!removed.has(k)) elements[k] = element;
  }
  Object.assign(elements, replacement.elements);
  return { ok: true, spec: { ...spec, elements } };
}

export function applySpecDiff(spec: Spec, diff: SpecDiff): SpecResult {
  return spliceSubtree(spec, diff.path, diff.after);
}

export function invertSpecDiff(diff: SpecDiff): SpecDiff {
  return { ...diff, before: diff.after, after: diff.before };
}
