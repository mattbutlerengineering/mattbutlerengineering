import security from "eslint-plugin-security";
import baseConfig from "./base.js";

export default [
  ...baseConfig,
  {
    plugins: { security },
    rules: {
      // Curated subset of eslint-plugin-security (issue #3410). The full `recommended`
      // preset was measured at 404 hits, dominated by `detect-object-injection` noise
      // (321 hits, explicit non-goal — high false-positive rate by reputation and by
      // inspection). Only the three high-signal rules below are wired; every hit in the
      // node tier was triaged and either fixed (a genuine ReDoS) or suppressed inline
      // with a justification comment (false positives from `safe-regex`'s blunt
      // "star height" heuristic, or repo-controlled/PR-reviewed pattern sources).
      "security/detect-unsafe-regex": "error",
      "security/detect-non-literal-regexp": "error",
      "security/detect-possible-timing-attacks": "error",
      // Module boundary enforcement — block frontend-only packages and entrypoints in backend services
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@mattbutlerengineering/rialto", "@mattbutlerengineering/rialto/*"],
              message: "Frontend-only package. Cannot import in backend services.",
            },
            {
              group: ["@mbe/api-client", "@mbe/api-client/*"],
              message: "Frontend-only package. Cannot import in backend services.",
            },
            {
              group: ["@mbe/auth/react"],
              message: "Frontend entrypoint. Use @mbe/auth/fastify in backend services.",
            },
            {
              group: ["@mbe/observability/sentry/react"],
              message:
                "Frontend entrypoint. Use @mbe/observability/sentry/node in backend services.",
            },
          ],
        },
      ],
    },
  },
  // Service layer enforcement — routes must not import database directly (go through service layer).
  // Health routes are exempt since they need direct DB access for connectivity checks.
  {
    files: ["**/routes/**/*.ts"],
    ignores: [
      "**/routes/health.ts",
      "**/routes/health.test.ts",
      "**/routes/ready.ts",
      "**/routes/ready.test.ts",
      "**/routes/**/*.test.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@mattbutlerengineering/rialto", "@mattbutlerengineering/rialto/*"],
              message: "Frontend-only package. Cannot import in backend services.",
            },
            {
              group: ["@mbe/api-client", "@mbe/api-client/*"],
              message: "Frontend-only package. Cannot import in backend services.",
            },
            {
              group: ["@mbe/auth/react"],
              message: "Frontend entrypoint. Use @mbe/auth/fastify in backend services.",
            },
            {
              group: ["@mbe/observability/sentry/react"],
              message:
                "Frontend entrypoint. Use @mbe/observability/sentry/node in backend services.",
            },
            {
              group: ["**/services/database", "**/services/database.js"],
              message:
                "Routes must not import database directly. Use the service layer instead (e.g., userService, reservationService).",
            },
            {
              group: ["@prisma/client", "@prisma/client/*"],
              message: "Routes must not import Prisma directly. Use the service layer instead.",
            },
          ],
        },
      ],
    },
  },
  // Type-checked promise safety, backend production code + node-tier tests.
  // Fastify swallows unawaited promises in handlers/hooks, so floating/misused
  // promises fail silently at runtime; an unawaited promise in a test is
  // usually a real bug too (an assertion that never runs). `projectService`
  // discovers each package's tsconfig — every node-tier consumer's tsconfig
  // *except* agent-core's already includes tests, so this covers all of them
  // directly (issue #3412; originally src-only per #3402). agent-core's
  // tsconfig.json excludes *.test.ts (kept out of its `tsc` build/typecheck)
  // — its own eslint.config.js layers a package-specific override that
  // redirects its test files to a lint-only tsconfig.eslint.json instead.
  // Measured 2026-07-12 (issue #3402): 6 violations across all node-tier
  // consumers, no lint wall-time increase vs. the non-type-checked baseline.
  {
    files: ["**/src/**/*.ts"],
    ignores: ["**/generated/**"],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
  // Type-checked, autofixable — flags `as X` / `!` / `<X>` assertions that
  // don't narrow the type. Kept src-only (unlike the promise rules above):
  // measured 2026-07-20 (issue #3411) against production code only; widening
  // to node-tier tests is a separate, unmeasured change.
  {
    files: ["**/src/**/*.ts"],
    ignores: ["**/*.test.ts", "**/*.spec.ts", "**/generated/**"],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
    },
  },
];
