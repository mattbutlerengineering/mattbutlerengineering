import nodeConfig from "@mbe/config/eslint/node";

export default [
  ...nodeConfig,
  {
    // agent-core imports @mbe/api-client for AgentSessionClient — allowed exception to
    // the "frontend-only" restriction because AgentSessionClient is a server-side HTTP client.
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
  // agent-core's tsconfig.json excludes *.test.ts (kept out of the production
  // `tsc` build/typecheck — see tsconfig.json), so the shared node-tier
  // promise-rule block's `projectService: true` can't discover a project for
  // test files. tsconfig.eslint.json (lint-only, includes tests) plugs that
  // gap for just this package via classic `project` mode (issue #3412).
  {
    files: ["**/src/**/*.test.ts"],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ["./tsconfig.eslint.json"],
      },
    },
  },
];
