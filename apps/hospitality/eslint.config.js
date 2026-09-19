import reactConfig from "@mbe/config/eslint/react";

export default [
  ...reactConfig,
  {
    // This app uses Rialto components exclusively (see CLAUDE.md); native browser
    // dialogs bypass the app's own theming/a11y and must never be used here.
    // See #4987 — window.confirm() in the floor-plan editor bypassed ConfirmDialog.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "confirm", message: "Use rialto ConfirmDialog instead of window.confirm()." },
        { name: "alert", message: "Use a rialto dialog/toast instead of window.alert()." },
        {
          name: "prompt",
          message: "Use a rialto dialog with a form input instead of window.prompt().",
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "window",
          property: "confirm",
          message: "Use rialto ConfirmDialog instead of window.confirm().",
        },
        {
          object: "window",
          property: "alert",
          message: "Use a rialto dialog/toast instead of window.alert().",
        },
        {
          object: "window",
          property: "prompt",
          message: "Use a rialto dialog with a form input instead of window.prompt().",
        },
      ],
    },
  },
];
