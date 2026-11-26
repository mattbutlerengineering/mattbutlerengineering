import type { Meta, StoryObj } from "@storybook/react-vite";
import { VisuallyHidden } from "./VisuallyHidden";

const meta: Meta<typeof VisuallyHidden> = {
  title: "Layout/VisuallyHidden",
  component: VisuallyHidden,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof VisuallyHidden>;

export const Default: Story = {
  render: (args) => (
    <button type="button">
      <span aria-hidden="true">✕</span>
      <VisuallyHidden {...args}>Close</VisuallyHidden>
    </button>
  ),
};

export const Focusable: Story = {
  args: { focusable: true },
  render: (args) => (
    <VisuallyHidden {...args}>
      <a href="#main">Skip to content</a>
    </VisuallyHidden>
  ),
};
