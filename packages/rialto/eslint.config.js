// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import reactConfig from "@mbe/config/eslint/react";

export default [...reactConfig, {
  ignores: ["dist/**", "scripts/**"],
}, ...storybook.configs["flat/recommended"]];
