// Root ESLint config for monorepo — used by lint-staged when running from repo root.
// Each package also has its own eslint.config.js for targeted linting.
import baseConfig from "./packages/config/eslint/base.js";

export default [
  ...baseConfig,
  {
    rules: {
      // Allow console in Node.js service files
      "no-console": "off",
      // Block non-rialto UI libraries
      "no-restricted-imports": ["error",
        {
          name: "@mui/material",
          message: "Use @mattbutlerengineering/rialto instead of MUI.",
        },
        {
          name: "@chakra-ui/react",
          message: "Use @mattbutlerengineering/rialto instead of Chakra.",
        },
        {
          name: "@radix-ui/*",
          message: "Use @mattbutlerengineering/rialto instead of Radix UI.",
        },
        {
          name: "@mantine/core",
          message: "Use @mattbutlerengineering/rialto instead of Mantine.",
        },
        {
          name: "antd",
          message: "Use @mattbutlerengineering/rialto instead of Ant Design.",
        },
      ],
    },
  },
];
