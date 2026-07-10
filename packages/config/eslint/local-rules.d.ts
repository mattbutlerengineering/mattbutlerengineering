import type { Rule } from "eslint";

/**
 * Hand-authored local ESLint plugin (`mbe-local`) consumed by
 * `@mbe/config/eslint/{base,react}`. Typed here so the individual rules can be
 * imported from `.ts` test files (the runtime is the hand-authored
 * `local-rules.js`).
 */
declare const plugin: {
  rules: Record<string, Rule.RuleModule>;
};
export default plugin;
