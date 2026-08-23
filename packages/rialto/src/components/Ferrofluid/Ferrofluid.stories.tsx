import type { Meta, StoryObj } from "@storybook/react-vite";
import { Ferrofluid } from "./Ferrofluid";

const meta: Meta<typeof Ferrofluid> = {
  title: "Specialty/Ferrofluid",
  component: Ferrofluid,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    color: { control: "color" },
    blobCount: { control: { type: "number", min: 1, max: 20 } },
    speed: {
      control: { type: "select" },
      options: ["slow", "medium", "fast"],
    },
    blurAmount: { control: { type: "number", min: 0, max: 30 } },
  },
  decorators: [
    (Story) => (
      <div style={{ position: "relative", height: "60vh", overflow: "hidden" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Ferrofluid>;

export const Default: Story = {
  args: {
    blobCount: 5,
    speed: "slow",
  },
};

export const FastAndAccent: Story = {
  args: {
    color: "var(--rialto-accent)",
    blobCount: 8,
    speed: "fast",
    blurAmount: 16,
  },
};

export const Minimal: Story = {
  args: {
    color: "var(--rialto-text-tertiary)",
    blobCount: 2,
    speed: "medium",
    blurAmount: 8,
  },
};
