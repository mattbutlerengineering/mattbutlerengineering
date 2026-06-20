import manifest from "@mattbutlerengineering/rialto/manifest";
import type { PropDef } from "../pages/components/PropsTable.js";

/**
 * Look up prop metadata for a component from the compiled rialto manifest.
 *
 * Returns an array of PropDef objects ready for use with PropsTable.
 * Returns an empty array when the component is not found in the manifest.
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
