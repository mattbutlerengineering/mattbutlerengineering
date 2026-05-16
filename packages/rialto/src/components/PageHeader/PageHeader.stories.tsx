import type { Meta, StoryObj } from "@storybook/react-vite";
import { PageHeader } from "./PageHeader";

const meta: Meta<typeof PageHeader> = {
  title: "Layout/PageHeader",
  component: PageHeader,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof PageHeader>;

export const TitleOnly: Story = {
  args: {
    title: "Account Settings",
  },
};

export const WithDescription: Story = {
  args: {
    title: "Account Settings",
    children: "Manage your profile, notifications, and security preferences.",
  },
};

export const WithBreadcrumb: Story = {
  args: {
    title: "Account Settings",
    breadcrumbs: [
      { label: "Home", href: "/" },
      { label: "Dashboard", href: "/dashboard" },
      { label: "Account Settings" },
    ],
  },
};

export const WithActions: Story = {
  args: {
    title: "Account Settings",
    breadcrumbs: [{ label: "Home", href: "/" }, { label: "Account Settings" }],
    actions: "Save Changes",
  },
};

export const WithMeta: Story = {
  args: {
    title: "Reservations",
    breadcrumbs: [{ label: "Home", href: "/" }, { label: "Reservations" }],
    meta: "42 total",
    actions: "New Reservation",
  },
};

export const WithAll: Story = {
  args: {
    title: "Project Alpha",
    breadcrumbs: [
      { label: "Home", href: "/" },
      { label: "Projects", href: "/projects" },
      { label: "Project Alpha" },
    ],
    meta: "Active",
    actions: "Edit Project",
    children: "A strategic initiative to deliver the next-generation platform.",
  },
};
