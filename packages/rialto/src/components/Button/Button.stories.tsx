import type { Meta, StoryObj } from "@storybook/react-vite";
import { within, userEvent, expect } from "@storybook/test";
import { Button } from "./Button";

const meta: Meta<typeof Button> = {
  title: "Foundation/Button",
  component: Button,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "ghost"],
    },
    size: {
      control: "select",
      options: ["sm", "md", "lg"],
    },
    onClick: { action: "clicked" },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: {
    variant: "primary",
    children: "Primary Action",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button");
    await expect(button).toBeInTheDocument();
    await userEvent.click(button);
    await expect(button).toHaveFocus();
  },
};

export const Secondary: Story = {
  args: {
    variant: "secondary",
    children: "Secondary Action",
  },
};

export const Ghost: Story = {
  args: {
    variant: "ghost",
    children: "Ghost Action",
  },
};

export const Loading: Story = {
  args: {
    variant: "primary",
    isLoading: true,
    loadingText: "Saving...",
    children: "Save Changes",
  },
};

export const Small: Story = {
  args: {
    size: "sm",
    children: "Small Button",
  },
};

export const Large: Story = {
  args: {
    size: "lg",
    children: "Large Button",
  },
};
