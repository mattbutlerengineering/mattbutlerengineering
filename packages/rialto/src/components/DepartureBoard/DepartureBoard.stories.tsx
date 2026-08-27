import type { Meta, StoryObj } from "@storybook/react-vite";
import { DepartureBoard } from "./DepartureBoard";

const meta: Meta<typeof DepartureBoard> = {
  title: "Data Display/DepartureBoard",
  component: DepartureBoard,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: "select",
      options: ["sm", "md", "lg"],
    },
    charset: {
      control: "select",
      options: ["alpha", "numeric", "alphanumeric", "full"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof DepartureBoard>;

export const Default: Story = {
  args: {
    phrases: ["MAKE IT REAL", "SHIP THE FUTURE", "BUILT TO LAST"],
  },
};

export const SingleStaticPhrase: Story = {
  args: {
    phrases: ["ARRIVING NOW"],
  },
};

export const SmallSize: Story = {
  args: {
    phrases: ["GATE 12", "ON TIME", "BOARDING"],
    size: "sm",
  },
};

export const FastCadence: Story = {
  args: {
    phrases: ["NOW", "BOARDING", "DEPARTED"],
    holdMs: 1200,
  },
};
