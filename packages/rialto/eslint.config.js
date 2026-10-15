// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import reactConfig from "@mbe/config/eslint/react";

const LOCALIZED_FILES = ["src/**/*.{ts,tsx}"];

export default [
  ...reactConfig,
  {
    ignores: ["dist/**", "scripts/**", "storybook-static/**"],
  },
  ...storybook.configs["flat/recommended"],
  {
    // Localization gate (docs/features/localization): hardcoded UI text is an
    // error across the whole package. The showcase app and a11y fixtures are
    // demo content, not library UI, so they are exempt.
    files: LOCALIZED_FILES,
    ignores: ["**/*.test.{ts,tsx}", "**/*.stories.tsx", "src/showcase/**", "src/test/**"],
    rules: { "mbe-local/no-literal-ui-strings": "error" },
  },
];
