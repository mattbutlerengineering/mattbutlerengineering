import baseConfig from "./base.js";

export default [
  ...baseConfig,
  {
    rules: {
      "no-console": "off",
      // Module boundary enforcement — block frontend-only packages and entrypoints in backend services
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@mbe/rialto", "@mbe/rialto/*"],
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
              group: ["@mbe/sentry/react"],
              message: "Frontend entrypoint. Use @mbe/sentry/node in backend services.",
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
    ignores: ["**/routes/health.ts", "**/routes/health.test.ts", "**/routes/ready.ts", "**/routes/ready.test.ts", "**/routes/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@mbe/rialto", "@mbe/rialto/*"],
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
              group: ["@mbe/sentry/react"],
              message: "Frontend entrypoint. Use @mbe/sentry/node in backend services.",
            },
            {
              group: ["**/services/database", "**/services/database.js"],
              message:
                "Routes must not import database directly. Use the service layer instead (e.g., userService, reservationService).",
            },
            {
              group: ["@prisma/client", "@prisma/client/*"],
              message:
                "Routes must not import Prisma directly. Use the service layer instead.",
            },
          ],
        },
      ],
    },
  },
];
