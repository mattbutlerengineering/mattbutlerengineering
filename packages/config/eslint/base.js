import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import localRules from "./local-rules.js";

// --- Node-20 API floor guardrail -------------------------------------------
// This project's package.json declares `engines.node: ">=20"`, and CI runs the
// test matrix on BOTH Node 20 and Node 22. We deliberately continue to SUPPORT
// Node 20, so APIs added after Node 20 (Node 21/22+) are banned here — the fix
// is to use a Node-20-safe equivalent, NOT to drop Node 20 support.
//
// Rationale: `Promise.withResolvers()` (Node 22+) once passed a local Node-22
// run but failed the Node-20 CI job ("green locally, red in CI"), silently
// stalling a PR at the CI Gate. This rule applies repo-wide, including test
// files (that is exactly where the miss happened).
const nodeFloorMessage = (api, since, alternative) =>
  `${api} requires Node ${since}+, but this project supports Node 20 ` +
  `(package.json engines: ">=20"; CI tests Node 20 and 22). ${alternative}`;

const nodeFloorRestrictedProperties = [
  {
    object: "Promise",
    property: "withResolvers",
    message: nodeFloorMessage(
      "Promise.withResolvers",
      22,
      "Use `new Promise((resolve, reject) => { ... })` and capture the resolvers instead."
    ),
  },
  {
    object: "Array",
    property: "fromAsync",
    message: nodeFloorMessage(
      "Array.fromAsync",
      22,
      "Collect the async iterable with a `for await` loop into an array instead."
    ),
  },
  {
    object: "Object",
    property: "groupBy",
    message: nodeFloorMessage(
      "Object.groupBy",
      21,
      "Group entries with `reduce` into a plain object (or a `Map`) instead."
    ),
  },
  {
    object: "Map",
    property: "groupBy",
    message: nodeFloorMessage(
      "Map.groupBy",
      21,
      "Group entries with `reduce` into a `Map` instead."
    ),
  },
  {
    object: "fs",
    property: "glob",
    message: nodeFloorMessage(
      "fs.glob",
      22,
      "Use `fs.readdirSync(dir, { recursive: true })` with a filter, or an existing userland glob dependency instead."
    ),
  },
  {
    object: "fs",
    property: "globSync",
    message: nodeFloorMessage(
      "fs.globSync",
      22,
      "Use `fs.readdirSync(dir, { recursive: true })` with a filter, or an existing userland glob dependency instead."
    ),
  },
];

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    plugins: {
      "mbe-local": localRules,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "mbe-local/no-tailwind-classes": "error",
      "mbe-local/require-rfc-7807-errors": "error",
      // Immutability-first convention (AGENTS.md): never mutate function arguments.
      "no-param-reassign": "error",
      // Repo convention: no console.log in production code — use the observability
      // package. warn/error/info stay allowed for operational logging. CLI packages
      // (tools/cli) and repo scripts opt out in their own configs: flat-config file
      // globs resolve relative to each consumer's config, so a shared "tools/**"
      // exemption can never match from inside the tools package itself.
      "no-console": ["error", { allow: ["warn", "error", "info"] }],
      // Ban Node-21/22-only APIs unsupported on the Node 20 floor (see comment above).
      "no-restricted-properties": ["error", ...nodeFloorRestrictedProperties],
    },
  },
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.turbo/**"],
  }
);
