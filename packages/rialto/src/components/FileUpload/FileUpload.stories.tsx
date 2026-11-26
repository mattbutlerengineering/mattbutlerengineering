import type { Meta, StoryObj } from "@storybook/react-vite";
import { within, expect } from "@storybook/test";
import { FileUpload } from "./FileUpload";

const meta: Meta<typeof FileUpload> = {
  title: "Forms/FileUpload",
  component: FileUpload,
  tags: ["autodocs"],
  args: { label: "Menus" },
};

export default meta;
type Story = StoryObj<typeof FileUpload>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Choose files" })).toBeInTheDocument();
  },
};

export const PdfOnly: Story = {
  args: { accept: ".pdf", maxSize: 5 * 1024 * 1024, hint: "PDF · max 5MB" },
};

export const Multiple: Story = {
  args: { multiple: true, maxFiles: 3, hint: "Up to 3 files" },
};

export const WithFiles: Story = {
  args: {
    multiple: true,
    defaultValue: [
      new File([new ArrayBuffer(2048)], "dinner-menu.pdf", { type: "application/pdf" }),
      new File([new ArrayBuffer(512000)], "wine-list.pdf", { type: "application/pdf" }),
    ],
  },
};

export const WithError: Story = {
  args: { error: "Add at least one menu" },
};

export const Disabled: Story = {
  args: { disabled: true },
};
