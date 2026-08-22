import type { Meta, StoryObj } from "@storybook/react-vite";
import { SplitFlap } from "./SplitFlap";

const meta: Meta<typeof SplitFlap> = {
  title: "Data Display/SplitFlap",
  component: SplitFlap,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    charset: {
      control: "select",
      options: ["alpha", "numeric", "alphanumeric", "full"],
    },
    size: {
      control: "select",
      options: ["sm", "md", "lg"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof SplitFlap>;

export const Default: Story = {
  args: {
    value: "ARRIVED",
    "aria-label": "Flight status: arrived",
  },
};

export const FullCharset: Story = {
  args: {
    value: "GATE 12",
    charset: "full",
    size: "lg",
    "aria-label": "Gate number: 12",
  },
};

export const NumericOnly: Story = {
  args: {
    value: "2024",
    charset: "numeric",
    "aria-label": "Year",
  },
};

export const FixedLength: Story = {
  args: {
    value: "OK",
    length: 8,
    "aria-label": "Status: OK",
  },
};

export const SmallSize: Story = {
  args: {
    value: "SMALL",
    size: "sm",
    "aria-label": "Small split flap display",
  },
};
