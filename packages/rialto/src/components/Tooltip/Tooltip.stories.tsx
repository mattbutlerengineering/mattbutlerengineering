import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { Tooltip } from "./Tooltip";
import { Button } from "../Button/Button";

const meta: Meta<typeof Tooltip> = {
  title: "Feedback/Tooltip",
  component: Tooltip,
  tags: ["autodocs"],
  argTypes: {
    placement: {
      control: { type: "select" },
      options: ["top", "bottom", "left", "right"],
    },
    delay: { control: { type: "number" } },
    showOnFocus: { control: "boolean" },
  },
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof Tooltip>;

export const Default: Story = {
  args: {
    content: "Copy to clipboard",
    delay: 0,
    children: <Button>Hover me</Button>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button");
    await expect(trigger).toBeInTheDocument();
    await userEvent.hover(trigger);
    const tooltip = await canvas.findByRole("tooltip");
    await expect(tooltip).toBeInTheDocument();
    await userEvent.unhover(trigger);
  },
};

export const PlacementTop: Story = {
  args: {
    content: "Appears above",
    placement: "top",
    delay: 0,
    children: <Button>Top</Button>,
  },
};

export const PlacementBottom: Story = {
  args: {
    content: "Appears below",
    placement: "bottom",
    delay: 0,
    children: <Button>Bottom</Button>,
  },
};

export const PlacementLeft: Story = {
  args: {
    content: "Appears to the left",
    placement: "left",
    delay: 0,
    children: <Button>Left</Button>,
  },
};

export const PlacementRight: Story = {
  args: {
    content: "Appears to the right",
    placement: "right",
    delay: 0,
    children: <Button>Right</Button>,
  },
};

export const WithDelay: Story = {
  args: {
    content: "Appears after 600ms",
    delay: 600,
    children: <Button>Delayed tooltip</Button>,
  },
};

export const FocusOnly: Story = {
  args: {
    content: "Keyboard accessible tooltip",
    delay: 0,
    showOnFocus: true,
    children: <Button>Focus me (Tab)</Button>,
  },
};
