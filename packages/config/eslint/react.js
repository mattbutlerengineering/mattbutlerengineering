import baseConfig from "./base.js";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import eslintReact from "@eslint-react/eslint-plugin";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactRefresh from "eslint-plugin-react-refresh";

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
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      "no-restricted-imports": [
        "warn",
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
      "no-restricted-syntax": [
        "warn",
        {
          selector: "JSXOpeningElement[name.name='button']",
          message: "Use <Button /> from '@mattbutlerengineering/rialto' instead of native <button>.",
        },
        {
          selector: "JSXOpeningElement[name.name='input']",
          message: "Use <Input /> from '@mattbutlerengineering/rialto' instead of native <input>.",
        },
        {
          selector: "JSXOpeningElement[name.name='select']",
          message: "Use <Select /> from '@mattbutlerengineering/rialto' instead of native <select>.",
        },
        {
          selector: "JSXOpeningElement[name.name='textarea']",
          message: "Use <TextArea /> from '@mattbutlerengineering/rialto' instead of native <textarea>.",
        },
        {
          selector: "JSXAttribute[value.type='Literal'][value.value=/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]",
          message: "Avoid hardcoded hex colors in JSX. Use Rialto CSS tokens (var(--rialto-*)) instead.",
        },
      ],
    },
  },
];
