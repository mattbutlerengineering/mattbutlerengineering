import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { Odometer } from "./Odometer";

const meta: Meta<typeof Odometer> = {
  title: "Data Display/Odometer",
  component: Odometer,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: "select",
      options: ["sm", "md", "lg"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Odometer>;

export const Default: Story = {
  args: {
    value: 128_540,
    "aria-label": "Total signups",
  },
};

export const Currency: Story = {
  args: {
    value: 1234.5,
    formatOptions: { style: "currency", currency: "USD" },
    "aria-label": "Total revenue",
  },
};

export const Percentage: Story = {
  args: {
    value: 0.874,
    formatOptions: { style: "percent", maximumFractionDigits: 1 },
    "aria-label": "Occupancy rate",
  },
};

export const SmallSize: Story = {
  args: {
    value: 42,
    size: "sm",
    "aria-label": "Days remaining",
  },
};

function LiveDemo() {
  const [value, setValue] = useState(1000);

  useEffect(() => {
    const timer = setInterval(() => {
      setValue((v) => v + Math.floor(Math.random() * 50));
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  return <Odometer value={value} aria-label="Live counter" />;
}

export const LiveUpdating: Story = {
  render: () => <LiveDemo />,
};
