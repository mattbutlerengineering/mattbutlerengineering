import type { Meta, StoryObj } from "@storybook/react-vite";
import { within, userEvent, expect } from "@storybook/test";
import { Toggle } from "./Toggle";

const meta: Meta<typeof Toggle> = {
  title: "Form/Toggle",
  component: Toggle,
  tags: ["autodocs"],
  argTypes: {
    checked: { control: "boolean" },
    disabled: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof Toggle>;

export const Default: Story = {
  args: {
    label: "Enable notifications",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("switch");
    await expect(toggle).toBeInTheDocument();
    await expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    await expect(toggle).toBeChecked();
  },
};

export const Checked: Story = {
  args: {
    label: "Dark mode",
    checked: true,
  },
};

export const Disabled: Story = {
  args: {
    label: "Experimental feature",
    disabled: true,
    disabledReason: "This feature is currently under maintenance.",
  },
};
