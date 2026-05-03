import type { Meta, StoryObj } from "@storybook/react-vite";
import { GlobalNav } from "./GlobalNav";

const meta: Meta<typeof GlobalNav> = {
  title: "Layout/GlobalNav",
  component: GlobalNav,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    currentApp: {
      control: "select",
      options: ["marketing", "hospitality", "rialto"],
    },
    theme: {
      control: "select",
      options: ["light", "dark"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof GlobalNav>;

export const Default: Story = {
  args: {
    currentApp: "marketing",
  },
};

export const WithThemeToggle: Story = {
  args: {
    currentApp: "marketing",
    theme: "light",
    onThemeToggle: () => {},
  },
};

export const HospitalityActive: Story = {
  args: {
    currentApp: "hospitality",
    theme: "dark",
    onThemeToggle: () => {},
  },
};

export const RialtoActive: Story = {
  args: {
    currentApp: "rialto",
    theme: "light",
    onThemeToggle: () => {},
  },
};
