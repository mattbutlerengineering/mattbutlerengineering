import type { Spec } from "@json-render/react";
import { catalog } from "@mbe/rialto-catalog/catalog";

export type CatalogValidation = { ok: true } | { ok: false; message: string };

/**
 * catalog.validate() stringifies the Zod issue, including the entire component
 * allow-list, which overflows the preview error. Say which component was
 * rejected and stop there.
 */
export function readableCatalogMessage(message: string): string {
  const jsonAt = message.indexOf("{");
  if (jsonAt === -1) return message.length > 280 ? `${message.slice(0, 260)}…` : message;
  const prefix = message.slice(0, jsonAt).replace(/:\s*$/, "").trim();
  try {
    const issue = JSON.parse(message.slice(jsonAt)) as {
      path?: unknown;
      message?: unknown;
      received?: unknown;
    };
    const path = Array.isArray(issue.path) ? issue.path.map(String) : [];
    const received =
      typeof issue.received === "string"
        ? issue.received
        : receivedFrom(typeof issue.message === "string" ? issue.message : "");
    if (path[path.length - 1] === "type" && received) {
      return `unknown component "${received}". Charts use BarChart.`;
    }
    if (
      typeof issue.message === "string" &&
      issue.message.length > 0 &&
      issue.message.length < 160
    ) {
      return prefix ? `${prefix}: ${issue.message}` : issue.message;
    }
  } catch {
    // Not a JSON issue. Fall through to a clipped copy of the original.
  }
  const clipped = message.length > 280 ? `${message.slice(0, 260)}…` : message;
  return prefix && clipped.startsWith("{") ? `${prefix}.` : clipped;
}

function receivedFrom(message: string): string | null {
  const match = /received ['"]([^'"]+)['"]/i.exec(message);
  return match?.[1] ?? null;
}

/** Whether `spec` only uses component types and props the Rialto catalog defines. */
export function validateSpecAgainstCatalog(spec: Spec): CatalogValidation {
  const result = catalog.validate(spec);
  if (result.success) return { ok: true };
  const raw = result.error?.message ?? "Spec does not conform to the Rialto catalog";
  return { ok: false, message: readableCatalogMessage(raw) };
}
