// Root ESLint config for monorepo — used by lint-staged when running from repo root,
// and by `eslint <path>` for any directory without its own eslint.config.js (flat
// config has no cascade, so those paths fall back to this one).
// Each workspace package also has its own eslint.config.js for targeted linting.
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
  {
    // ACMM plugin scripts are Node CLIs (audit/eval runners invoked by workflows) —
    // same treatment as scripts/ above. Not yet a pnpm workspace package (#3912),
    // so it has no eslint.config.js of its own and is linted via this root config.
    files: ["plugins/acmm/**"],
    languageOptions: {
      globals: {
        URL: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        process: "readonly",
        setTimeout: "readonly",
      },
    },
    rules: {
      "no-console": "off",
    },
  },
];
