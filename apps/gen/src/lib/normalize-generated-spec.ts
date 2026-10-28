import type { Spec } from "@json-render/react";
import { materializeCatalogProps } from "@mbe/rialto-catalog";

/**
 * A dashboard prompt asks for a chart, and the catalog used to have none, so
 * the model emits the series as a sentence ("Jan $18.2k · Feb $19.9k · …").
 * When that shape is still what comes back, render it as a BarChart.
 *
 * flatToTree only links `parentKey`. A DataTable whose parentKey misses, or
 * one gated on `{ $state }` (this playground has no state model), stays in
 * the JSON and never mounts — so the heading shows, the seam fallback does
 * not, and sample rows never run.
 */

interface GenElement {
  type: string;
  props?: Record<string, unknown>;
  children?: string[];
  visible?: unknown;
  slots?: Record<string, string[]>;
}

// The value must read as money ("$18.2k") or a percent ("12%"); bare numbers
// such as "Jan 15, Feb 20, Mar 10" are ordinary prose and stay Text.
const POINT =
  /^([A-Za-z][A-Za-z0-9.'-]{0,12})\s+(\$\d[\d,]*(?:\.\d+)?[kKmMbB]?|\d[\d,]*(?:\.\d+)?%)$/;

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

function elementsOf(spec: Spec): Record<string, GenElement> {
  return spec.elements as Record<string, GenElement>;
}

function reachableKeys(elements: Record<string, GenElement>, root: string): Set<string> {
  const seen = new Set<string>();
  const walk = (key: string) => {
    if (seen.has(key)) return;
    const element = elements[key];
    if (!element) return;
    seen.add(key);
    for (const child of element.children ?? []) walk(child);
    for (const slot of Object.values(element.slots ?? {})) {
      if (!Array.isArray(slot)) continue;
      for (const child of slot) walk(child);
    }
  };
  walk(root);
  return seen;
}

/** State visibility never resolves here, so a gated table mounts as nothing. */
function revealStateGated(element: GenElement): GenElement {
  if (element.visible === undefined || typeof element.visible === "boolean") return element;
  const next = { ...element };
  delete next.visible;
  return next;
}

/**
 * Attach elements flatToTree left out of the root. A child of an orphan stays
 * under that orphan; only the orphan subtree root is added.
 */
function linkOrphans(spec: Spec, elements: Record<string, GenElement>): Record<string, GenElement> {
  if (!spec.root || !elements[spec.root]) return elements;
  const seen = reachableKeys(elements, spec.root);
  const orphans = Object.keys(elements).filter((key) => !seen.has(key));
  if (orphans.length === 0) return elements;
  const referenced = new Set<string>();
  for (const key of orphans) {
    for (const child of elements[key]?.children ?? []) referenced.add(child);
  }
  const roots = orphans.filter((key) => !referenced.has(key));
  const attach = roots.length > 0 ? roots : orphans;
  if (attach.length === 0) return elements;
  const root = elements[spec.root];
  if (!root) return elements;
  return {
    ...elements,
    [spec.root]: { ...root, children: [...(root.children ?? []), ...attach] },
  };
}

function prepareTree(spec: Spec): Spec {
  const source = elementsOf(spec);
  let changed = false;
  const revealed: Record<string, GenElement> = {};
  for (const [key, element] of Object.entries(source)) {
    const next = revealStateGated(element);
    if (next !== element) changed = true;
    revealed[key] = next;
  }
  const linked = linkOrphans(spec, revealed);
  if (!changed && linked === revealed) return spec;
  return { ...spec, elements: linked as Spec["elements"] };
}

/** Return a spec whose trend sentences are BarChart elements and whose tree actually renders. */
export function normalizeGeneratedSpec(spec: Spec): Spec {
  const prepared = prepareTree(spec);
  let changed = prepared !== spec;
  const elements: Record<string, GenElement> = { ...elementsOf(prepared) };
  for (const [key, element] of Object.entries(elements)) {
    if (!element) continue;
    const materialized = materializeCatalogProps(element.type, element.props);
    if (materialized !== element.props) {
      changed = true;
      elements[key] = { ...element, props: materialized as typeof element.props };
      continue;
    }
    if (element.type !== "Text") continue;
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
  return changed ? { ...prepared, elements: elements as Spec["elements"] } : prepared;
}
