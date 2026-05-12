import reactConfig from "@mbe/config/eslint/react";

export default [
  ...reactConfig,
  {
    ignores: ["dist/**"],
  },
  {
    // vi.mock() factories use capitalized property keys (Button, Text, etc.) that
    // react/jsx-no-undef misidentifies as undefined JSX components when linted
    // from the monorepo root via lint-staged. Disable for test files only.
    files: ["**/*.test.tsx"],
    rules: {
      "react/jsx-no-undef": "off",
    },
  },
];
