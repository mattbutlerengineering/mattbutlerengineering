import type { Spec } from "@json-render/react";

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

export function specStats(spec: Spec | null): SpecStats | null {
  if (!spec) return null;
  const elements = Object.values(spec.elements);
  const types = new Set(elements.map((element) => element.type));
  return { elementCount: elements.length, componentTypes: Array.from(types).sort() };
}
