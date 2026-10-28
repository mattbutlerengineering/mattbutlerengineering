import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { BarChart } from "./BarChart";

const meta: Meta<typeof BarChart> = {
  title: "Data Display/BarChart",
  component: BarChart,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof BarChart>;

export const RevenueTrend: Story = {
  args: {
    label: "Revenue trend",
    data: [
      { label: "Jan", value: "$18.2k" },
      { label: "Feb", value: "$19.9k" },
      { label: "Mar", value: "$21.4k" },
      { label: "Apr", value: "$22.8k" },
      { label: "May", value: "$24.1k" },
      { label: "Jun", value: "$22.0k" },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Revenue trend")).toBeInTheDocument();
    await expect(canvas.getByText("Jan")).toBeInTheDocument();
    await expect(canvas.getByText("$22.0k")).toBeInTheDocument();
  },
};
