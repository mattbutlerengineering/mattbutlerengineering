import type { Meta, StoryObj } from "@storybook/react-vite";
import { NavigationMenu } from "./NavigationMenu";

const meta: Meta<typeof NavigationMenu> = {
  title: "Layout/NavigationMenu",
  component: NavigationMenu,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof NavigationMenu>;

export const Horizontal: Story = {
  args: {
    items: [
      { label: "Home", href: "/" },
      { label: "About", href: "/about" },
      { label: "Blog", href: "/blog" },
      { label: "Contact", href: "/contact" },
    ],
  },
};

export const WithDropdownItems: Story = {
  args: {
    items: [
      { label: "Home", href: "/" },
      {
        label: "Products",
        children: [
          { label: "Widgets", href: "/products/widgets" },
          { label: "Gadgets", href: "/products/gadgets" },
          { label: "Gizmos", href: "/products/gizmos" },
        ],
      },
      {
        label: "Resources",
        children: [
          { label: "Documentation", href: "/docs" },
          { label: "Blog", href: "/blog" },
          { label: "Community", href: "/community" },
        ],
      },
      { label: "Contact", href: "/contact" },
    ],
  },
};

export const MultipleDropdowns: Story = {
  args: {
    items: [
      {
        label: "Platform",
        children: [
          { label: "Overview", href: "/platform" },
          { label: "Security", href: "/platform/security" },
        ],
      },
      {
        label: "Solutions",
        children: [
          { label: "Enterprise", href: "/solutions/enterprise" },
          { label: "Startups", href: "/solutions/startups" },
          { label: "Agencies", href: "/solutions/agencies" },
        ],
      },
      {
        label: "Developers",
        children: [
          { label: "API Reference", href: "/api" },
          { label: "SDKs", href: "/sdks" },
          { label: "Changelog", href: "/changelog" },
        ],
      },
      { label: "Pricing", href: "/pricing" },
    ],
  },
};
