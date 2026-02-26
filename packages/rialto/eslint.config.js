import reactConfig from "@mbe/config/eslint/react";

export default [
  ...reactConfig,
  {
    ignores: ["dist/**", "scripts/**"],
  },
];
