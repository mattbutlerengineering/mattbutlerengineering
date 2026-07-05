import type { Meta, StoryObj } from "@storybook/react-vite";
import { within, userEvent, expect } from "@storybook/test";
import { Trash2, Plus, Pencil, X } from "lucide-react";
import { IconButton } from "./IconButton";

const meta: Meta<typeof IconButton> = {
  title: "Foundation/IconButton",
  component: IconButton,
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
type Story = StoryObj<typeof IconButton>;

export const Ghost: Story = {
  args: {
    icon: <Trash2 size={18} />,
    "aria-label": "Delete",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Delete" });
    await expect(button).toBeInTheDocument();
    await userEvent.click(button);
    await expect(button).toHaveFocus();
  },
};

export const Secondary: Story = {
  args: {
    icon: <Pencil size={18} />,
    "aria-label": "Edit",
    variant: "secondary",
  },
};

export const Primary: Story = {
  args: {
    icon: <Plus size={18} />,
    "aria-label": "Add item",
    variant: "primary",
  },
};

export const Small: Story = {
  args: {
    icon: <X size={14} />,
    "aria-label": "Dismiss",
    size: "sm",
  },
};

export const Large: Story = {
  args: {
    icon: <Plus size={20} />,
    "aria-label": "Add item",
    size: "lg",
  },
};
