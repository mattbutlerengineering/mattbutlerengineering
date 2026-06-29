/**
 * Rialto Component Character Limits
 *
 * Re-exports the canonical `characterLimits` array and `CharacterLimit`
 * interface from `component-metadata.ts`, which is the single source of truth.
 *
 * Existing generators (generate-manifest.ts, generate-registry.ts) import
 * from this path and continue to work without change. Future generator
 * conversions can import directly from `./component-metadata.js`.
 */

export type { CharacterLimit } from "./component-metadata.js";
export { characterLimits } from "./component-metadata.js";
