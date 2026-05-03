import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppBar } from "./AppBar";

const meta: Meta<typeof AppBar> = {
  title: "Layout/AppBar",
  component: AppBar,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof AppBar>;

export const Default: Story = {
  args: {
    logo: "Acme",
    glass: true,
  },
};

export const WithActions: Story = {
  args: {
    logo: "Acme",
    actions: "Login",
    glass: true,
  },
};

export const NoGlass: Story = {
  args: {
    logo: "Acme",
    actions: "Login",
    glass: false,
  },
};

export const CustomHeight: Story = {
  args: {
    logo: "Acme",
    actions: "Login",
    glass: true,
    height: "72px",
  },
};
