import type { Meta, StoryObj } from "@storybook/react-vite";
import { Breadcrumb } from "./Breadcrumb";

const meta: Meta<typeof Breadcrumb> = {
  title: "Data Display/Breadcrumb",
  component: Breadcrumb,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    maxItems: {
      control: { type: "number", min: 0, max: 6 },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Breadcrumb>;

export const Default: Story = {
  args: {
    items: [
      { label: "Home", href: "/" },
      { label: "Products", href: "/products" },
      { label: "Widget" },
    ],
  },
};

export const TwoLevels: Story = {
  args: {
    items: [{ label: "Home", href: "/" }, { label: "Settings" }],
  },
};

export const DeepHierarchyCollapsed: Story = {
  args: {
    items: [
      { label: "Home", href: "/" },
      { label: "Company", href: "/company" },
      { label: "Engineering", href: "/company/engineering" },
      { label: "Teams", href: "/company/engineering/teams" },
      { label: "Platform", href: "/company/engineering/teams/platform" },
      { label: "Rialto" },
    ],
    maxItems: 3,
  },
};

export const ButtonStyleCrumb: Story = {
  args: {
    items: [
      { label: "Home", onClick: () => {} },
      { label: "Reservations", onClick: () => {} },
      { label: "Booking #4419" },
    ],
  },
};
