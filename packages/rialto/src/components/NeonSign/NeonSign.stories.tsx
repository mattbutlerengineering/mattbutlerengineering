import type { Meta, StoryObj } from "@storybook/react-vite";
import { NeonSign } from "./NeonSign";
import { Stack } from "../Stack/Stack";

const meta: Meta<typeof NeonSign> = {
  title: "Data Display/NeonSign",
  component: NeonSign,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    state: {
      control: { type: "select" },
      options: ["open", "opening-soon", "closed", "unset"],
    },
    size: {
      control: { type: "select" },
      options: ["sm", "md", "lg"],
    },
    showCaption: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof NeonSign>;

export const Default: Story = {
  args: {
    "aria-label": "Open until 10:00 PM",
    state: "open",
  },
};

export const AllStates: Story = {
  render: () => (
    <Stack gap="xl">
      <NeonSign state="open" aria-label="Open until 10:00 PM" />
      <NeonSign state="opening-soon" aria-label="Opens at 5:00 PM" />
      <NeonSign state="closed" aria-label="Closed, opens Tuesday at 5:00 PM" />
      <NeonSign state="unset" aria-label="No operating hours set" />
    </Stack>
  ),
};

export const Sizes: Story = {
  render: () => (
    <Stack gap="xl">
      <NeonSign state="open" aria-label="Open until 10:00 PM" size="sm" />
      <NeonSign state="open" aria-label="Open until 10:00 PM" size="md" />
      <NeonSign state="open" aria-label="Open until 10:00 PM" size="lg" />
    </Stack>
  ),
};

export const WithoutCaption: Story = {
  args: {
    "aria-label": "Open until 10:00 PM",
    state: "open",
    showCaption: false,
  },
};
