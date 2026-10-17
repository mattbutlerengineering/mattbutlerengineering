import type { Spec } from "@json-render/react";
import { catalog } from "@mbe/rialto-catalog/catalog";

export type CatalogValidation = { ok: true } | { ok: false; message: string };

/** Whether `spec` only uses component types and props the Rialto catalog defines. */
export function validateSpecAgainstCatalog(spec: Spec): CatalogValidation {
  const result = catalog.validate(spec);
  if (result.success) return { ok: true };
  return {
    ok: false,
    message: result.error?.message ?? "Spec does not conform to the Rialto catalog",
  };
}
