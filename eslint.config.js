// Root ESLint config for monorepo — used by lint-staged when running from repo root.
// Each package also has its own eslint.config.js for targeted linting.
import baseConfig from "./packages/config/eslint/base.js";

export default [
  ...baseConfig,
  {
    rules: {
      // Allow console in Node.js service files
      "no-console": "off",
    },
  },
];
