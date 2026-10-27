import type { Spec } from "@json-render/react";

/**
 * A dashboard prompt asks for a chart, and the catalog used to have none, so
 * the model emits the series as a sentence ("Jan $18.2k · Feb $19.9k · …").
 * When that shape is still what comes back, render it as a BarChart.
 */

const POINT = /^([A-Za-z][A-Za-z0-9.'-]{0,12})\s+(\$?\d[\d,]*(?:\.\d+)?[kKmMbB]?)$/;

export function parseTrendPoints(text: string): { label: string; value: string }[] | null {
  const trimmed = text.trim();
  if (trimmed.length < 8 || trimmed.length > 400) return null;
  const parts = trimmed.split(/\s*[·•|,]\s*/);
  if (parts.length < 3) return null;
  const points: { label: string; value: string }[] = [];
  for (const part of parts) {
    const match = POINT.exec(part.trim());
    if (!match || match[1] === undefined || match[2] === undefined) return null;
    points.push({ label: match[1], value: match[2] });
  }
  return points;
}

function textContent(props: unknown): string | null {
  if (props === null || typeof props !== "object") return null;
  const record = props as Record<string, unknown>;
  if (typeof record.children === "string") return record.children;
  if (typeof record.text === "string") return record.text;
  return null;
}

/** Return a spec whose trend sentences are BarChart elements. */
export function normalizeGeneratedSpec(spec: Spec): Spec {
  let changed = false;
  const elements: Spec["elements"] = { ...spec.elements };
  for (const [key, element] of Object.entries(elements)) {
    if (!element || element.type !== "Text") continue;
    const text = textContent(element.props);
    const points = text ? parseTrendPoints(text) : null;
    if (!points) continue;
    changed = true;
    elements[key] = {
      ...element,
      type: "BarChart",
      props: { label: "Trend", data: points },
    };
  }
  return changed ? { ...spec, elements } : spec;
}
