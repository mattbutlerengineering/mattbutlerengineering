import baseConfig from "./base.js";

export default [
  ...baseConfig,
  {
    rules: {
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
  // Type-checked promise safety for backend production code. Fastify swallows
  // unawaited promises in handlers/hooks, so floating/misused promises fail
  // silently at runtime. `projectService` discovers each package's tsconfig;
  // test files are excluded because packages/agent-core excludes *.test.ts from
  // its tsconfig (projectService hard-errors on files outside a project).
  // Measured 2026-07-12 (issue #3402): 6 violations across all node-tier
  // consumers, no lint wall-time increase vs. the non-type-checked baseline.
  {
    files: ["**/src/**/*.ts"],
    ignores: ["**/*.test.ts", "**/*.spec.ts", "**/generated/**"],
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
];
