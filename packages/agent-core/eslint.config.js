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
];
