import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { within, userEvent, expect } from "@storybook/test";
import { TimePicker } from "./TimePicker";

const meta: Meta<typeof TimePicker> = {
  title: "Forms/TimePicker",
  component: TimePicker,
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
type Story = StoryObj<typeof TimePicker>;

function DefaultDemo() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <TimePicker label="Arrival" placeholder="Select a time" value={value} onChange={setValue} />
  );
}

function WithStepAndBoundsDemo() {
  const [value, setValue] = useState<string | null>("12:30");
  return (
    <TimePicker
      label="Reservation time"
      value={value}
      onChange={setValue}
      step={30}
      min="09:00"
      max="21:00"
    />
  );
}

export const Default: Story = {
  render: () => <DefaultDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByLabelText("Arrival");
    await userEvent.click(trigger);
    await expect(canvas.getByRole("listbox")).toBeInTheDocument();
  },
};

export const WithStepAndBounds: Story = {
  render: () => <WithStepAndBoundsDemo />,
};
