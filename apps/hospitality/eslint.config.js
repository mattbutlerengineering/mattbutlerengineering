import reactConfig from "@mbe/config/eslint/react";

export default [
  ...reactConfig,
  // Test files use HTML elements inside vi.mock() factories — disable the
  // prefer-rialto-components fixer so eslint --fix does not transform
  // <button>/<span>/<h1> to undefined Rialto component names.
  {
    files: ["src/**/*.test.{ts,tsx}"],
    rules: {
      "mbe-local/prefer-rialto-components": "off",
    },
  },
];
