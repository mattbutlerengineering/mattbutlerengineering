import type { Spec } from "@json-render/react";
import { materializeCatalogProps } from "@mbe/rialto-catalog";

/**
 * A dashboard prompt asks for a chart, and the catalog used to have none, so
 * the model emits the series as a sentence ("Jan $18.2k · Feb $19.9k · …").
 * When that shape is still what comes back, render it as a BarChart.
 */

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

const CHART_ALIASES = new Set(["LineChart", "AreaChart", "Chart"]);

interface Point {
  label: string;
  value: number | string;
}

function asPoints(value: unknown): Point[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const points: Point[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object") return null;
    const record = item as Record<string, unknown>;
    const label = record.label ?? record.x ?? record.name;
    const amount = record.value ?? record.y;
    if (typeof label !== "string") return null;
    if (typeof amount !== "number" && typeof amount !== "string") return null;
    points.push({ label, value: amount });
  }
  return points;
}

function chartProps(props: unknown): { label: string; data: Point[] } | null {
  if (props === null || typeof props !== "object") return null;
  const record = props as Record<string, unknown>;
  const data = asPoints(record.data ?? record.points ?? record.series);
  if (!data) return null;
  const label =
    typeof record.label === "string" && record.label.trim() !== "" ? record.label : "Trend";
  return { label, data };
}

/**
 * Pictures are not a catalog component. An Image becomes an Avatar (initials
 * when src fails) plus a Text caption of the alt, so a broken URL still says
 * what the picture was.
 */
function repairImage(
  key: string,
  element: Spec["elements"][string],
  elements: Spec["elements"]
): boolean {
  if (!element || (element.type !== "Image" && element.type !== "Img")) return false;
  const props = (element.props ?? {}) as Record<string, unknown>;
  const alt =
    (typeof props.alt === "string" && props.alt.trim() !== "" ? props.alt : null) ??
    (typeof props.name === "string" && props.name.trim() !== "" ? props.name : null) ??
    "Image";
  const src = typeof props.src === "string" ? props.src : undefined;
  const avatarKey = `${key}__avatar`;
  const captionKey = `${key}__caption`;
  elements[key] = {
    ...element,
    type: "Stack",
    props: { direction: "column", gap: "xs" },
    children: [avatarKey, captionKey],
  };
  elements[avatarKey] = {
    type: "Avatar",
    props: { src, name: alt.slice(0, 30), alt },
    children: [],
  };
  elements[captionKey] = {
    type: "Text",
    props: { children: alt, variant: "caption" },
    children: [],
  };
  return true;
}

/** Return a spec whose trend sentences, unknown charts, and images can render. */
export function normalizeGeneratedSpec(spec: Spec): Spec {
  if (!spec.elements) return spec;
  let changed = false;
  const elements: Spec["elements"] = { ...spec.elements };
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
  for (const [key, element] of Object.entries(elements)) {
    if (!element) continue;
    if (CHART_ALIASES.has(element.type)) {
      const chart = chartProps(element.props);
      if (!chart) continue;
      changed = true;
      elements[key] = { ...element, type: "BarChart", props: chart };
      continue;
    }
    if (repairImage(key, element, elements)) changed = true;
  }
  return changed ? { ...spec, elements } : spec;
}
