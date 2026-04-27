import baseConfig from "./base.js";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import eslintReact from "@eslint-react/eslint-plugin";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactRefresh from "eslint-plugin-react-refresh";
import { fixupPluginRules } from "@eslint/compat";

// ESLint 10 removed legacy rule context methods (getFilename, getScope, etc.).
// Once plugins ship ESLint 10 native support, remove @eslint/compat completely.

export default [
  ...baseConfig,
  eslintReact.configs.recommended,
  {
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      "jsx-a11y": jsxA11y,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactPlugin.configs.flat.recommended.rules,
      ...reactPlugin.configs.flat["jsx-runtime"].rules,
      ...reactHooksPlugin.configs.flat.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "@eslint-react/set-state-in-effect": "warn",
      "@eslint-react/component-hook-factories": "warn",
      "@eslint-react/purity": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "react/prop-types": "off",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // Warn on console.log in production source files
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      // Module boundary enforcement — block backend-only packages and entrypoints in frontend apps
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@mbe/agent-core", "@mbe/agent-core/*"],
              message: "Backend-only package. Cannot import in frontend apps.",
            },
            {
              group: ["@mbe/observability", "@mbe/observability/*"],
              message: "Backend-only package. Cannot import in frontend apps.",
            },
            {
              group: ["@mbe/auth/fastify"],
              message: "Backend entrypoint. Use @mbe/auth/react in frontend apps.",
            },
            {
              group: ["@mbe/sentry/node"],
              message: "Backend entrypoint. Use @mbe/sentry/react in frontend apps.",
            },
          ],
        },
      ],
      // Warn on hardcoded hex colors in JSX — prefer Rialto CSS tokens (var(--rialto-*))
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            "JSXAttribute[value.type='Literal'][value.value=/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]",
          message:
            "Avoid hardcoded hex colors in JSX. Use Rialto CSS tokens (var(--rialto-*)) instead.",
        },
        {
          selector:
            "Property[value.type='Literal'][value.value=/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/][parent.parent.type='JSXExpressionContainer']",
          message:
            "Avoid hardcoded hex colors in JSX expressions. Use Rialto CSS tokens (var(--rialto-*)) instead.",
        },
      ],
    },
  },
];
