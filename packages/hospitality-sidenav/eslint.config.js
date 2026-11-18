import reactConfig from "@mbe/config/eslint/react";

export default [
  ...reactConfig,
  {
    // Localization gate: UI text comes from the remote's own catalogs, never a literal.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: { "mbe-local/no-literal-ui-strings": "error" },
  },
];
