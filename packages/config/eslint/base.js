import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import localRules from "./local-rules.js";

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
    },
  },
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.turbo/**"],
  }
);
