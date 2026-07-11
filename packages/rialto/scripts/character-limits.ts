/**
 * Rialto Component Character Limits
 *
 * Re-exports the `characterLimits` residue array and `CharacterLimit` interface
 * from `component-metadata.ts`. That array holds only the limits catalog
 * `charLimits` cannot express (nested, slot, non-cataloged); `introspectComponents()`
 * merges it with the co-located catalog limits into one model.
 *
 * Existing generators (generate-manifest.ts, generate-registry.ts) import
 * from this path and continue to work without change. Future generator
 * conversions can import directly from `./component-metadata.js`.
 */

export type { CharacterLimit } from "./component-metadata.js";
export { characterLimits } from "./component-metadata.js";
