import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { Stat } from "./Stat";

const meta: Meta<typeof Stat> = {
  title: "Data Display/Stat",
  component: Stat,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  argTypes: {
    trend: {
      control: { type: "radio" },
      options: ["up", "down", "neutral"],
    },
    size: {
      control: { type: "radio" },
      options: ["sm", "md", "lg"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Stat>;

export const Default: Story = {
  args: {
    label: "Lap Time",
    value: "1:25.410",
    delta: "-0.342s",
    trend: "down",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const stat = canvas.getByRole("group", { name: "Lap Time" });
    await expect(stat).toBeInTheDocument();
    const value = canvas.getByText("1:25.410");
    await expect(value).toBeInTheDocument();
  },
};

export const TrendUp: Story = {
  args: {
    label: "Championship Points",
    value: "575",
    delta: "+42",
    trend: "up",
  },
};

export const TrendDown: Story = {
  args: {
    label: "Pit Stop Time",
    value: "2.4s",
    delta: "-0.3s",
    trend: "down",
  },
};

export const Neutral: Story = {
  args: {
    label: "Grid Position",
    value: "P1",
    delta: "No change",
    trend: "neutral",
  },
};

export const NoDelta: Story = {
  args: {
    label: "Total Races",
    value: "22",
  },
};

export const Small: Story = {
  args: {
    label: "Top Speed",
    value: "372 km/h",
    delta: "+5 km/h",
    trend: "up",
    size: "sm",
  },
};

export const Large: Story = {
  args: {
    label: "Season Wins",
    value: "19",
    delta: "+3",
    trend: "up",
    size: "lg",
  },
};

export const Dashboard: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
      <Stat label="Race Position" value="P1" delta="+2" trend="up" />
      <Stat label="Lap Time" value="1:25.410" delta="-0.342s" trend="down" />
      <Stat label="Tire Age" value="18 laps" trend="neutral" />
      <Stat label="Gap to Leader" value="+3.2s" delta="+0.4s" trend="up" />
    </div>
  ),
};
