import type { Meta, StoryObj } from "@storybook/react-vite";
import { WatchLoader } from "./WatchLoader";

const meta: Meta<typeof WatchLoader> = {
  title: "Feedback/WatchLoader",
  component: WatchLoader,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: { type: "select" },
      options: ["sm", "md", "lg"],
    },
    speed: {
      control: { type: "select" },
      options: ["slow", "normal", "fast"],
    },
    variant: {
      control: { type: "select" },
      options: ["default", "gold", "steel", "rose"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof WatchLoader>;

export const Default: Story = {
  args: {
    "aria-label": "Loading results",
    size: "md",
    speed: "normal",
    variant: "default",
  },
};

export const GoldFast: Story = {
  args: {
    "aria-label": "Saving",
    size: "lg",
    speed: "fast",
    variant: "gold",
  },
};

export const SteelSlow: Story = {
  args: {
    "aria-label": "Loading",
    size: "sm",
    speed: "slow",
    variant: "steel",
  },
};

export const CustomPixelSize: Story = {
  args: {
    "aria-label": "Loading",
    size: 160,
    variant: "rose",
  },
};
