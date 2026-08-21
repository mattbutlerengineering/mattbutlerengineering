import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Calendar } from "./Calendar";

const meta: Meta<typeof Calendar> = {
  title: "Forms/Calendar",
  component: Calendar,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    onChange: { action: "changed" },
  },
};

export default meta;
type Story = StoryObj<typeof Calendar>;

function ControlledDemo() {
  const [value, setValue] = useState<string | null>("2026-07-15");
  return <Calendar value={value} onChange={setValue} locale="en-US" />;
}

export const Default: Story = {
  render: () => <ControlledDemo />,
};

export const Empty: Story = {
  args: {
    value: null,
    onChange: () => {},
    locale: "en-US",
  },
};

export const WithBounds: Story = {
  args: {
    value: "2026-07-15",
    onChange: () => {},
    min: "2026-07-01",
    max: "2026-07-25",
    locale: "en-US",
  },
};

export const WithDisabledDates: Story = {
  args: {
    value: "2026-07-15",
    onChange: () => {},
    isDateDisabled: (isoDate: string) => {
      const day = Number(isoDate.split("-")[2] ?? 0);
      return day % 7 === 0;
    },
    locale: "en-US",
  },
};

export const WeekStartsOnSunday: Story = {
  args: {
    value: "2026-07-15",
    onChange: () => {},
    weekStartsOn: 0,
    locale: "en-US",
  },
};
