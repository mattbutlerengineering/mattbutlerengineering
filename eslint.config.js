// Root ESLint config for monorepo — used by lint-staged when running from repo root.
// Each package also has its own eslint.config.js for targeted linting.
import baseConfig from "./packages/config/eslint/base.js";

export default [
  ...baseConfig,
  {
    // Repo-maintenance scripts are CLIs — stdout output is their product.
    // (scripts/ is not part of any lint gate; this keeps editor linting sane.)
    files: ["scripts/**"],
    rules: {
      "no-console": "off",
    },
  },
];
