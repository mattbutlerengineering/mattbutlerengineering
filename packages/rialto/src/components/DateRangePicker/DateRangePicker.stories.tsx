import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { within, userEvent, expect } from "@storybook/test";
import { DateRangePicker } from "./DateRangePicker";
import type { DateRangeValue } from "../DateRange/DateRange";

const meta: Meta<typeof DateRangePicker> = {
  title: "Forms/DateRangePicker",
  component: DateRangePicker,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof DateRangePicker>;

function DefaultDemo() {
  const [range, setRange] = useState<DateRangeValue>({ start: null, end: null });
  return <DateRangePicker label="Stay dates" value={range} onChange={setRange} locale="en-US" />;
}

function WithBoundsDemo() {
  const [range, setRange] = useState<DateRangeValue>({
    start: "2026-07-10",
    end: "2026-07-15",
  });
  return (
    <DateRangePicker
      label="Booking dates"
      value={range}
      onChange={setRange}
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
    const trigger = canvas.getByLabelText("Stay dates");
    await userEvent.click(trigger);
    await expect(canvas.getByRole("grid")).toBeInTheDocument();
  },
};

export const WithBounds: Story = {
  render: () => <WithBoundsDemo />,
};
