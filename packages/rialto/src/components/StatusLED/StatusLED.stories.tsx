import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusLED } from "./StatusLED";
import { Stack } from "../Stack/Stack";

const meta: Meta<typeof StatusLED> = {
  title: "Feedback/StatusLED",
  component: StatusLED,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["success", "warning", "danger", "accent", "neutral", "off"],
    },
    size: {
      control: { type: "select" },
      options: ["xs", "sm", "md", "lg", "xl"],
    },
    pulse: { control: "boolean" },
    label: { control: "text" },
  },
};

export default meta;
type Story = StoryObj<typeof StatusLED>;

export const Default: Story = {
  args: {
    variant: "success",
    size: "md",
  },
};

export const Pulsing: Story = {
  args: {
    variant: "warning",
    size: "md",
    pulse: true,
    label: "Arming",
  },
};

export const AllVariants: Story = {
  render: () => (
    <Stack direction="row" gap="lg" align="center">
      <StatusLED variant="success" label="Success" />
      <StatusLED variant="warning" label="Warning" />
      <StatusLED variant="danger" label="Danger" />
      <StatusLED variant="accent" label="Accent" />
      <StatusLED variant="neutral" label="Neutral" />
      <StatusLED variant="off" label="Off" />
    </Stack>
  ),
};

export const CustomSize: Story = {
  args: {
    variant: "accent",
    size: 32,
  },
};
