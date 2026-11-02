import type { Meta, StoryObj } from "@storybook/react-vite";
import { within, expect } from "@storybook/test";
import { ImageUpload } from "./ImageUpload";

const meta: Meta<typeof ImageUpload> = {
  title: "Specialty/ImageUpload",
  component: ImageUpload,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof ImageUpload>;

export const Default: Story = {
  args: {
    onChange: () => {},
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/add image/i)).toBeInTheDocument();
  },
};

export const WithProgress: Story = {
  args: {
    onChange: () => {},
    progress: 45,
  },
};

export const WithLabelAndError: Story = {
  args: {
    onChange: () => {},
    label: "Logo",
    error: "Too big",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Add image Logo" })).toBeInTheDocument();
    await expect(canvas.getByRole("alert")).toHaveTextContent("Too big");
  },
};

export const WithExistingImage: Story = {
  args: {
    value: "https://placehold.co/400x300/f8f6f3/1a1918?text=Preview",
    onChange: () => {},
  },
};
