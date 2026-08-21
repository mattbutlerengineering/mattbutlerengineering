import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { DateRange, type DateRangeValue } from "./DateRange";

const meta: Meta<typeof DateRange> = {
  title: "Forms/DateRange",
  component: DateRange,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    onChange: { action: "changed" },
  },
};

export default meta;
type Story = StoryObj<typeof DateRange>;

function ControlledDemo() {
  const [value, setValue] = useState<DateRangeValue>({ start: "2026-07-10", end: "2026-07-15" });
  return <DateRange value={value} onChange={setValue} locale="en-US" />;
}

export const Default: Story = {
  render: () => <ControlledDemo />,
};

export const Empty: Story = {
  args: {
    value: { start: null, end: null },
    onChange: () => {},
    locale: "en-US",
  },
};

export const InProgress: Story = {
  args: {
    value: { start: "2026-07-10", end: null },
    onChange: () => {},
    locale: "en-US",
  },
};

export const WithBounds: Story = {
  args: {
    value: { start: "2026-07-10", end: "2026-07-15" },
    onChange: () => {},
    min: "2026-07-01",
    max: "2026-07-25",
    locale: "en-US",
  },
};

export const WithDisabledDates: Story = {
  args: {
    value: { start: "2026-07-10", end: "2026-07-15" },
    onChange: () => {},
    isDateDisabled: (isoDate: string) => {
      const day = Number(isoDate.split("-")[2] ?? 0);
      return day % 7 === 0;
    },
    locale: "en-US",
  },
};
