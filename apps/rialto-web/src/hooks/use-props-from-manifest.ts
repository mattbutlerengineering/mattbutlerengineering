import manifest from "@mattbutlerengineering/rialto/manifest";
import type { PropDef } from "../pages/components/PropsTable.js";

/**
 * Look up prop metadata for a component from the compiled rialto manifest.
 *
 * Returns an array of PropDef objects ready for use with PropsTable.
 * Returns an empty array when the component is not found in the manifest.
 *
 * The manifest projection already filters props to the real component API
 * (declaredInRialto) — no HTML-attribute bleed-through reaches this hook, so
 * every listed prop is component-specific and rendered as-is.
 */
export function usePropsFromManifest(componentName: string): PropDef[] {
  const entry = manifest.components.find((c) => c.name === componentName);
  if (!entry) return [];

  return entry.props.map((p) => ({
    name: p.name,
    type: p.type.replace(/\s*\|\s*undefined$/, ""),
    description: p.description ?? "",
    required: p.required,
  }));
}
