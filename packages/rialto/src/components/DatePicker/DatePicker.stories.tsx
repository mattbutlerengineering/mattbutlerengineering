import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { within, userEvent, expect } from "@storybook/test";
import { DatePicker } from "./DatePicker";

const meta: Meta<typeof DatePicker> = {
  title: "Forms/DatePicker",
  component: DatePicker,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    onChange: { action: "changed" },
    placement: {
      control: "select",
      options: ["top", "bottom", "left", "right"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof DatePicker>;

function DefaultDemo() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <DatePicker
      label="Check-in"
      placeholder="Select a date"
      value={value}
      onChange={setValue}
      locale="en-US"
    />
  );
}

function WithBoundsDemo() {
  const [value, setValue] = useState<string | null>("2026-07-15");
  return (
    <DatePicker
      label="Booking date"
      value={value}
      onChange={setValue}
      min="2026-07-01"
      max="2026-08-31"
      locale="en-US"
    />
  );
}

export const Default: Story = {
  render: () => <DefaultDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByLabelText("Check-in");
    await userEvent.click(trigger);
    await expect(canvas.getByRole("grid")).toBeInTheDocument();
  },
};

export const WithBounds: Story = {
  render: () => <WithBoundsDemo />,
};
