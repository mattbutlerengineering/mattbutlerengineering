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
  //
  // `tsconfigRootDir` is required here: classic `project` mode resolves its
  // relative path against the *invoking process's* cwd, not this config
  // file's directory. `pnpm lint` (cwd = package dir) happened to resolve it
  // correctly, but the root pre-commit hook's lint-staged runs eslint from
  // the monorepo root, which resolved `./tsconfig.eslint.json` to a
  // nonexistent repo-root path and hard-failed every commit touching an
  // agent-core test file (discovered while landing #3468).
  {
    files: ["**/src/**/*.test.ts"],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ["./tsconfig.eslint.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
