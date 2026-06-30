import manifest from "@mattbutlerengineering/rialto/manifest";
import type { PropDef } from "../pages/components/PropsTable.js";

/**
 * Sentinel prop names that signal the start of HTML-attribute bleed-through
 * in components that extend HTMLElement. These are React's internal HTML
 * attribute mappings — never legitimate component-specific props for rialto
 * components, which use controlled patterns (checked, not defaultChecked).
 */
const HTML_NOISE_SENTINELS = new Set(["defaultChecked", "defaultValue"]);

/**
 * Look up prop metadata for a component from the compiled rialto manifest.
 *
 * Returns an array of PropDef objects ready for use with PropsTable.
 * Returns an empty array when the component is not found in the manifest.
 *
 * Truncates the prop list at the first HTML-noise sentinel prop
 * (defaultChecked / defaultValue). Components that extend HTML elements
 * have hundreds of inherited HTML attributes appended after their own props;
 * the sentinel marks where component-specific API ends and HTML noise begins.
 */
export function usePropsFromManifest(componentName: string): PropDef[] {
  const entry = manifest.components.find((c) => c.name === componentName);
  if (!entry) return [];

  const noiseStart = entry.props.findIndex((p) => HTML_NOISE_SENTINELS.has(p.name));
  const ownProps = noiseStart === -1 ? entry.props : entry.props.slice(0, noiseStart);

  return ownProps.map((p) => ({
    name: p.name,
    type: p.type.replace(/\s*\|\s*undefined$/, ""),
    description: p.description ?? "",
    required: p.required,
  }));
}
