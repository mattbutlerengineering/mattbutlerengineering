import type { Meta, StoryObj } from "@storybook/react-vite";
import { Slider } from "./Slider";

const meta: Meta<typeof Slider> = {
  title: "Forms/Slider",
  component: Slider,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    onChange: { action: "changed" },
    disabled: { control: "boolean" },
    showValue: { control: "boolean" },
  },
  decorators: [
    (Story) => (
      <div style={{ width: "320px" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Slider>;

export const Default: Story = {
  args: {
    label: "Volume",
    defaultValue: 50,
    showValue: true,
  },
};

export const WithRange: Story = {
  args: {
    label: "Brightness",
    min: 10,
    max: 200,
    defaultValue: 100,
    showValue: true,
  },
};

export const WithStep: Story = {
  args: {
    label: "Opacity",
    min: 0,
    max: 100,
    step: 10,
    defaultValue: 60,
    showValue: true,
    formatValue: (v) => `${v}%`,
  },
};

export const WithCustomFormat: Story = {
  args: {
    label: "Price limit",
    min: 0,
    max: 1000,
    step: 50,
    defaultValue: 400,
    showValue: true,
    formatValue: (v) => `$${v}`,
  },
};

export const Disabled: Story = {
  args: {
    label: "CPU throttle",
    value: 40,
    disabled: true,
    showValue: true,
    disabledReason: "CPU throttling is managed by your organization.",
  },
};
