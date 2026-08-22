import type { Meta, StoryObj } from "@storybook/react-vite";
import { FlipDot } from "./FlipDot";
import { textToMatrix } from "./pixel-font";

const meta: Meta<typeof FlipDot> = {
  title: "Data Display/FlipDot",
  component: FlipDot,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    staggerDirection: {
      control: "select",
      options: ["left-to-right", "top-to-bottom", "center-out", "random"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof FlipDot>;

export const Default: Story = {
  args: {
    matrix: textToMatrix("OPEN"),
    "aria-label": "OPEN",
  },
};

export const TopToBottomCascade: Story = {
  args: {
    matrix: textToMatrix("SOLD"),
    "aria-label": "SOLD",
    staggerDirection: "top-to-bottom",
  },
};

export const CenterOutCascade: Story = {
  args: {
    matrix: textToMatrix("HI"),
    "aria-label": "HI",
    staggerDirection: "center-out",
  },
};

export const LargerDots: Story = {
  args: {
    matrix: textToMatrix("42"),
    "aria-label": "42",
    dotSize: 14,
    dotGap: 5,
  },
};

export const AllOff: Story = {
  args: {
    matrix: Array.from({ length: 7 }, () => Array.from({ length: 10 }, () => false)),
    "aria-label": "Empty display",
  },
};
