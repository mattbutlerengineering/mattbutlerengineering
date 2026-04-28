import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import security from "eslint-plugin-security";
import localRules from "./local-rules.js";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  security.configs.recommended,
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
    },
  },
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.turbo/**"],
  }
);
