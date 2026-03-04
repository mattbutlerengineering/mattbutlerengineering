import nodeConfig from "@mbe/config/eslint/node";

export default [
  ...nodeConfig,
  {
    ignores: ["src/generated/**"],
  },
];
