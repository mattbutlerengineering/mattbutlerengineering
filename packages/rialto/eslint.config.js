// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import reactConfig from "@mbe/config/eslint/react";

const LOCALIZED_FILES = ["src/i18n/**/*.{ts,tsx}"];

export default [
  ...reactConfig,
  {
    ignores: ["dist/**", "scripts/**", "storybook-static/**"],
  },
  ...storybook.configs["flat/recommended"],
  {
    // Localization gate (docs/features/localization): hardcoded UI text is an
    // error in every path already converted to the locale's messages. Each
    // translation change widens LOCALIZED_FILES; it becomes src/** once the
    // whole package is localized.
    files: LOCALIZED_FILES,
    ignores: ["**/*.test.{ts,tsx}", "**/*.stories.tsx"],
    rules: { "mbe-local/no-literal-ui-strings": "error" },
  },
];
