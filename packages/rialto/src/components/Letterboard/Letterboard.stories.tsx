import type { Meta, StoryObj } from "@storybook/react-vite";
import { Letterboard } from "./Letterboard";

const meta: Meta<typeof Letterboard> = {
  title: "Data Display/Letterboard",
  component: Letterboard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: { type: "select" },
      options: ["sm", "md", "lg"],
    },
    align: {
      control: { type: "select" },
      options: ["start", "center", "end"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Letterboard>;

export const Default: Story = {
  args: {
    lines: ["TONIGHT", [{ text: "OYSTER " }, { text: "HOUR", accent: true }], "5 TILL 7"],
  },
};

export const AllInk: Story = {
  args: {
    lines: ["NO RESERVATIONS", "WALK INS ONLY"],
  },
};

export const SingleAccentLetter: Story = {
  args: {
    lines: [[{ text: "SUNDA" }, { text: "Y", accent: true }, { text: " ROAST" }]],
  },
};

export const MenuBoard: Story = {
  args: {
    size: "sm",
    align: "start",
    lines: [
      "TODAYS PLATES",
      "",
      [{ text: "CHOWDER " }, { text: "9", accent: true }],
      [{ text: "PATTY MELT " }, { text: "14", accent: true }],
      [{ text: "KEY LIME PIE " }, { text: "7", accent: true }],
    ],
  },
};

export const LargeMarquee: Story = {
  args: {
    size: "lg",
    lines: [[{ text: "OPEN " }, { text: "LATE", accent: true }]],
  },
};

export const EndAligned: Story = {
  args: {
    align: "end",
    lines: ["LAST CALL", [{ text: "1 AM", accent: true }]],
  },
};
