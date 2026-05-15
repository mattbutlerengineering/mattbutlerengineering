import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, expect, userEvent, within } from "storybook/test";
import { Banner } from "./Banner";
import { Button } from "../Button/Button";

const meta: Meta<typeof Banner> = {
  title: "Feedback/Banner",
  component: Banner,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["info", "warning", "error", "accent"],
    },
    dismissible: { control: "boolean" },
  },
  args: {
    onDismiss: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof Banner>;

export const Default: Story = {
  args: {
    variant: "info",
    children: "A new version of Rialto is available. Check the changelog for details.",
  },
};

export const Warning: Story = {
  args: {
    variant: "warning",
    children: "Your session will expire in 5 minutes. Save your work to avoid losing changes.",
  },
};

export const Error: Story = {
  args: {
    variant: "error",
    children: "We could not sync your reservation data. Please refresh the page.",
  },
};

export const Accent: Story = {
  args: {
    variant: "accent",
    children: "New feature: AI-powered reservation suggestions are now available.",
    action: (
      <Button size="sm" variant="ghost">
        Try it
      </Button>
    ),
  },
};

export const WithAction: Story = {
  args: {
    variant: "info",
    children: "A new version of the app is available.",
    action: <Button size="sm">Update now</Button>,
  },
};

export const Dismissible: Story = {
  args: {
    variant: "info",
    children: "This banner can be dismissed by clicking the X button.",
    dismissible: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const banner = canvas.getByRole("status");
    await expect(banner).toBeInTheDocument();
    const dismissButton = canvas.getByRole("button", { name: /dismiss/i });
    await expect(dismissButton).toBeInTheDocument();
    await userEvent.click(dismissButton);
    await expect(canvas.queryByRole("status")).not.toBeInTheDocument();
  },
};

export const DismissibleWarning: Story = {
  args: {
    variant: "warning",
    children: "Scheduled maintenance at 11 PM tonight. Service may be briefly unavailable.",
    dismissible: true,
  },
};

export const DismissibleWithAction: Story = {
  args: {
    variant: "info",
    children: "Updates are ready to install.",
    action: <Button size="sm">Install</Button>,
    dismissible: true,
  },
};
