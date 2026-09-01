/**
 * Rialto shipped-component counting.
 *
 * The Overview stat row advertises how many components the library ships.
 * That count is derived at build time from Rialto's compiled manifest (see
 * `component-count.config.ts`, which feeds the `__RIALTO_COMPONENT_COUNT__`
 * define) rather than importing the manifest itself into the client bundle —
 * the manifest carries every component's full description, prop table, and
 * character-limit metadata (~110 KiB), of which the Overview page only ever
 * needed a single integer. This pure helper is the shared, testable counting
 * primitive.
 */

interface RialtoManifest {
  components: readonly unknown[];
}

/** Count the components listed in a Rialto manifest. */
export function countRialtoComponents(manifest: RialtoManifest): number {
  return manifest.components.length;
}
