import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConfirmDialog } from "./ConfirmDialog";
import { Button } from "../Button/Button";
import { useState } from "react";
import { within, userEvent, expect } from "@storybook/test";

const meta: Meta<typeof ConfirmDialog> = {
  title: "Overlay/ConfirmDialog",
  component: ConfirmDialog,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["default", "destructive"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof ConfirmDialog>;

const Template = (args) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={args.variant === "destructive" ? "ghost" : "primary"}
        onClick={() => setOpen(true)}
      >
        {args.variant === "destructive" ? "Delete Item" : "Confirm Action"}
      </Button>
      <ConfirmDialog
        open={open}
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
        title={args.title || "Are you sure?"}
        description={args.description}
        variant={args.variant || "default"}
      />
    </>
  );
};

export const Default: Story = {
  render: () => <Template title="Confirm Action" description="This action will be saved." />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Confirm Action" });
    await userEvent.click(button);
    await expect(canvas.getByRole("alertdialog")).toBeInTheDocument();
  },
};

export const Destructive: Story = {
  render: () => (
    <Template
      variant="destructive"
      title="Delete this item?"
      description="This action cannot be undone. The item will be permanently removed."
    />
  ),
};

const CustomLabelsDialog = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Archive Project
      </Button>
      <ConfirmDialog
        open={open}
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
        title="Archive project?"
        description="The project will be archived and can be restored later."
        confirmLabel="Archive"
        cancelLabel="Keep it"
      />
    </>
  );
};

export const WithCustomLabels: Story = {
  render: () => <CustomLabelsDialog />,
};
