/**
 * Shared artifact projection for the Rialto manifest and registry generators.
 *
 * `introspectComponents()` produces the canonical ComponentMetadata model, in
 * which every prop carries a `declaredInRialto` flag (true when the prop
 * originates in the rialto components dir, false for HTML-attribute
 * bleed-through inherited from `HTMLAttributes<…>`). The manifest and registry
 * JSON artifacts describe the *real* component API, so they project away every
 * inherited HTML attribute by filtering on that flag — the same question
 * generate-catalog.ts answers with `if (!prop.declaredInRialto) continue`.
 *
 * The manifest and registry entries differ only by a single field
 * (`importPath`, present on registry components), so both consume this one
 * projection: `buildManifest`/`buildRegistry` are thin headers over it.
 */

import type { ComponentMetadata } from "./component-metadata.js";

/** Prop descriptor shared by the manifest and registry JSON schemas. */
export interface PropInfo {
  name: string;
  type: string;
  required: boolean;
  default?: string;
  description?: string;
}

/** Character-limit entry shared by the manifest and registry JSON schemas. */
export interface CharacterLimitInfo {
  prop: string;
  max: number;
  reason: string;
}

/**
 * A projected component entry. `importPath` is present only for registry
 * output (manifest entries omit it); its position in the key order matches the
 * historical registry layout: name, description, importPath, props, slots,
 * characterLimits.
 */
export interface ProjectedComponent {
  name: string;
  description?: string;
  importPath?: string;
  props: PropInfo[];
  slots: string[];
  characterLimits?: CharacterLimitInfo[];
}

/**
 * Project the canonical model to the manifest/registry JSON shape.
 *
 * - Filters each prop to only those declared in the rialto components dir
 *   (`declaredInRialto`) — dropping inherited HTML-attribute bleed-through.
 * - Projects each surviving prop to the fields the JSON schema defines
 *   (name, type, required; optional default and description).
 * - Includes `importPath` only when `includeImportPath` is set (registry).
 * - Omits `characterLimits` when empty so the output stays minimal.
 * - Does NOT sort — introspectComponents() already returns components in
 *   byte-order (not localeCompare, which diverges macOS vs Linux CI).
 */
export function projectComponents(
  components: ComponentMetadata[],
  options: { includeImportPath: boolean }
): ProjectedComponent[] {
  return components.map((comp) => {
    const props: PropInfo[] = [];
    for (const p of comp.props) {
      // Drop HTML-attribute bleed-through: keep only the real component API.
      if (!p.declaredInRialto) continue;
      const prop: PropInfo = { name: p.name, type: p.type, required: p.required };
      if (p.description !== undefined) prop.description = p.description;
      if (p.default !== undefined) prop.default = p.default;
      props.push(prop);
    }

    const entry: ProjectedComponent = {
      name: comp.name,
      description: comp.description,
      ...(options.includeImportPath ? { importPath: comp.importPath } : {}),
      props,
      slots: comp.slots,
    };

    if (comp.characterLimits.length > 0) {
      entry.characterLimits = comp.characterLimits;
    }

    return entry;
  });
}
