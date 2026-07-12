import manifest from "@mattbutlerengineering/rialto/manifest";

/**
 * Prop metadata row rendered by PropsTable.
 * Owned here (not in PropsTable.tsx) so the hook and the component don't
 * import each other (breaks the import cycle); PropsTable re-exports it.
 */
export interface PropDef {
  name: string;
  type: string;
  default?: string;
  description: string;
  [key: string]: unknown;
}

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
