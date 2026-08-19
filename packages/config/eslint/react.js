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
    settings: { react: { version: "19" } },
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
      "react-hooks/component-hook-factories": "warn",
      "react/prop-types": "off",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // no-console (error, allow warn/error/info) and no-explicit-any (error)
      // are inherited from the base config.
      // Module boundary enforcement — block backend-only packages and entrypoints in frontend apps
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@mbe/observability",
              message: "Backend-only package. Cannot import in frontend apps.",
            },
            {
              name: "@mbe/observability/sentry/node",
              message: "Backend entrypoint. Use @mbe/observability/sentry/react in frontend apps.",
            },
            {
              name: "@mbe/auth/fastify",
              message: "Backend entrypoint. Use @mbe/auth/react in frontend apps.",
            },
          ],
          patterns: [
            {
              group: ["@mbe/agent-core", "@mbe/agent-core/*"],
              message: "Backend-only package. Cannot import in frontend apps.",
            },
            {
              group: ["@mbe/observability/sentry/node"],
              message: "Backend entrypoint. Cannot import in frontend apps.",
            },
          ],
        },
      ],
      "mbe-local/prefer-rialto-components": "warn",
      "mbe-local/require-accessible-field-label": "error",
      "react/jsx-no-undef": "off",
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
  {
    files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "mbe-local/prefer-rialto-components": "off",
      // Test suites deliberately exercise the unlabeled render path (e.g.
      // verifying no <label> renders when the label prop is omitted) —
      // that's a valid, intentional case, not a real accessibility gap.
      "mbe-local/require-accessible-field-label": "off",
      // Tests may use `any` for mock shapes without failing lint (102 existing
      // uses measured 2026-07-12, issue #3402); production code errors via base.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];
