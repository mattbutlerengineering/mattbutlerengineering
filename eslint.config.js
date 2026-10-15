// Root ESLint config for monorepo — used by lint-staged when running from repo root,
// and by `eslint <path>` for any directory without its own eslint.config.js (flat
// config has no cascade, so those paths fall back to this one).
// Each workspace package also has its own eslint.config.js for targeted linting.
import baseConfig from "./packages/config/eslint/base.js";

// Every plain-JS file the root config serves runs on Node — repo scripts,
// Claude hooks, root-level config files. (Package sources resolve their own
// eslint.config.js first, so they never reach this fallback.) The base config
// keeps `no-undef` on for JS and declares no runtime globals, so without these
// every `process`/`console` reference is an error — 814 of the 826 findings
// when scripts/ was first linted. Explicit list rather than the `globals`
// package: that package is not a declared dependency anywhere in the
// workspace, and infrastructure/worker/eslint.config.js sets the precedent.
const NODE_GLOBALS = {
  AbortController: "readonly",
  AbortSignal: "readonly",
  Buffer: "readonly",
  clearInterval: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  fetch: "readonly",
  performance: "readonly",
  process: "readonly",
  setInterval: "readonly",
  setTimeout: "readonly",
  TextDecoder: "readonly",
  TextEncoder: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
};

export default [
  ...baseConfig,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: { globals: NODE_GLOBALS },
  },
  {
    // Repo-maintenance scripts and Claude automation are CLIs — stdout output
    // is their product (.claude/hooks/* speak their protocol over stdout, and
    // .claude/skills/*/scripts/* print reports). scripts/ is linted by
    // `pnpm --dir scripts lint` (turbo `lint` task) and staged .mjs files by
    // lint-staged; this keeps that gate signal, not noise.
    files: [".claude/**", "scripts/**"],
    rules: {
      "no-console": "off",
    },
  },
];
