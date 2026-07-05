/**
 * Rialto design-token counting.
 *
 * The Overview stat row advertises how many design tokens the library ships.
 * Rather than hardcoding an approximate number that silently goes stale, the
 * count is derived at build time from Rialto's compiled stylesheet (see
 * `token-count.config.ts`, which feeds the `__RIALTO_TOKEN_COUNT__` define).
 * This pure helper is the shared, testable counting primitive.
 */

/** Matches a `--rialto-*` custom property *declaration* (name followed by `:`). */
const RIALTO_TOKEN_DECLARATION = /--rialto-[\w-]+(?=\s*:)/g;

/**
 * Count the unique `--rialto-*` design-token custom properties declared in a
 * stylesheet. `var(--rialto-*)` usages and non-Rialto custom properties are
 * ignored, and a token redeclared across theme blocks is counted once.
 */
export function countRialtoTokens(css: string): number {
  return new Set(css.match(RIALTO_TOKEN_DECLARATION) ?? []).size;
}
