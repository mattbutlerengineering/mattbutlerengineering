import type { Linter } from "eslint";

/**
 * Shared flat ESLint config consumed by `@mbe/config/eslint/{node,react}` and
 * every workspace package. Typed here so it can be imported from `.ts` test
 * files (the runtime is the hand-authored `base.js`).
 */
declare const config: Linter.Config[];
export default config;
