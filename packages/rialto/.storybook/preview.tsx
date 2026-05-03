import React, { useEffect, useState } from "react";
import type { Preview } from "@storybook/react";
import { RialtoProvider } from "../src/providers/RialtoProvider";
import "../src/styles-entry.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: "light",
      values: [
        { name: "light", value: "#f8f6f3" },
        { name: "dark", value: "#1a1918" },
      ],
    },
    a11y: {
      config: {
        rules: [{ id: "color-contrast", enabled: true }],
      },
    },
  },
  decorators: [
    (Story, context) => {
      const [theme, setTheme] = useState<"light" | "dark">("light");

      useEffect(() => {
        const selected = context.globals.backgrounds?.value || "#f8f6f3";
        setTheme(selected === "#1a1918" ? "dark" : "light");
      }, [context.globals.backgrounds?.value]);

      return (
        <RialtoProvider theme={theme}>
          <Story />
        </RialtoProvider>
      );
    },
  ],
  globalTypes: {
    backgrounds: {
      description: "Global background color",
      defaultValue: { value: "#f8f6f3", name: "light" },
    },
  },
};

export default preview;
