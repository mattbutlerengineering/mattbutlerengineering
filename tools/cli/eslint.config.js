import nodeConfig from "@mbe/config/eslint/node";

export default [
  ...nodeConfig,
  {
    // @mbe/api-client uses standard fetch + Web APIs — Node 18+ compatible.
    // The node ESLint preset flags it as "frontend-only" to prevent use in
    // backend services (Fastify); that guard does not apply to the CLI tool.
    rules: {
      "no-restricted-imports": "off",
    },
  },
];
