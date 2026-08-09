import baseConfig from "@mbe/config/eslint/base";

// ACMM plugin scripts are Node CLIs (audit/eval runners invoked by workflows,
// see plugins/acmm/README.md) — same treatment as scripts/ at the repo root.
// base.js declares no environment globals, so the handful the scripts and
// their node:test suites rely on need explicit declaration here.
const ACMM_GLOBALS = {
  URL: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  process: "readonly",
  setTimeout: "readonly",
};

export default [
  ...baseConfig,
  {
    languageOptions: {
      globals: ACMM_GLOBALS,
    },
    rules: {
      "no-console": "off",
    },
  },
];
