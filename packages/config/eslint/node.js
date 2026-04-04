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
];
