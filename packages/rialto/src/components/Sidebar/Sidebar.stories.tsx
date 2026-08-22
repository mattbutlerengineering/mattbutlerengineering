import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Sidebar, type SidebarItem, type SidebarSection } from "./Sidebar";

const meta: Meta<typeof Sidebar> = {
  title: "Layout/Sidebar",
  component: Sidebar,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    onCollapse: { action: "collapseChanged" },
  },
};

export default meta;
type Story = StoryObj<typeof Sidebar>;

const flatItems: SidebarItem[] = [
  { id: "home", label: "Home", href: "/", active: true },
  { id: "reservations", label: "Reservations", href: "/reservations" },
  { id: "guests", label: "Guests", href: "/guests" },
  { id: "billing", label: "Billing", href: "/billing", disabled: true },
];

const sections: SidebarSection[] = [
  {
    label: "Operations",
    items: [
      { id: "dashboard", label: "Dashboard", href: "/dashboard", active: true },
      { id: "reservations", label: "Reservations", href: "/reservations" },
    ],
  },
  {
    label: "Settings",
    items: [
      { id: "profile", label: "Profile", href: "/settings/profile" },
      { id: "billing", label: "Billing", href: "/settings/billing" },
    ],
  },
];

export const Flat: Story = {
  args: {
    items: flatItems,
  },
};

export const Grouped: Story = {
  args: {
    items: sections,
  },
};

export const Collapsed: Story = {
  args: {
    items: flatItems,
    collapsed: true,
  },
};

function CollapsibleDemo() {
  const [collapsed, setCollapsed] = useState(false);
  return <Sidebar items={sections} collapsed={collapsed} onCollapse={setCollapsed} />;
}

export const Collapsible: Story = {
  render: () => <CollapsibleDemo />,
};
