import type { Spec } from "@json-render/react";
import type { SpecDiff } from "./spec-subtree.js";

export interface SpecStats {
  elementCount: number;
  componentTypes: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Decode an untrusted stored spec (API/DB payloads are typed `unknown`).
 * A json-render Spec is flat: `{ root, elements: Record<id, { type, ... }> }`.
 * Returns null for anything that does not match, so callers never render or
 * count a malformed value.
 */
export function decodeSpec(value: unknown): Spec | null {
  if (!isRecord(value)) return null;
  if (typeof value.root !== "string" || !isRecord(value.elements)) return null;
  for (const element of Object.values(value.elements)) {
    if (!isRecord(element) || typeof element.type !== "string") return null;
  }
  return value as unknown as Spec;
}

/**
 * Decode an untrusted stored refinement. Both halves must be well-formed
 * subtrees rooted at `path`, else null so a malformed payload is never applied.
 */
export function decodeSpecDiff(value: unknown): SpecDiff | null {
  if (!isRecord(value)) return null;
  const { parentId, path } = value;
  if (parentId !== null && typeof parentId !== "string") return null;
  if (typeof path !== "string" || path === "") return null;
  const before = decodeSpec(value.before);
  const after = decodeSpec(value.after);
  if (!before || !after || before.root !== path || after.root !== path) return null;
  return { parentId, path, before, after };
}

export function specStats(spec: Spec | null): SpecStats | null {
  if (!spec) return null;
  const elements = Object.values(spec.elements);
  const types = new Set(elements.map((element) => element.type));
  return { elementCount: elements.length, componentTypes: Array.from(types).sort() };
}
