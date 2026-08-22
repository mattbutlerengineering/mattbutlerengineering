import type { Meta, StoryObj } from "@storybook/react-vite";
import { Navbar, type NavbarLink } from "./Navbar";

const meta: Meta<typeof Navbar> = {
  title: "Layout/Navbar",
  component: Navbar,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Navbar>;

const basicLinks: NavbarLink[] = [
  { id: "home", label: "Home", href: "/" },
  { id: "reservations", label: "Reservations", href: "/reservations", badge: 3 },
  { id: "settings", label: "Settings", href: "/settings" },
];

const nestedLinks: NavbarLink[] = [
  { id: "home", label: "Home", href: "/" },
  {
    id: "properties",
    label: "Properties",
    children: [
      { id: "hotels", label: "Hotels", href: "/properties/hotels" },
      { id: "resorts", label: "Resorts", href: "/properties/resorts" },
    ],
  },
  { id: "reports", label: "Reports", href: "/reports" },
];

export const Basic: Story = {
  args: {
    links: basicLinks,
  },
};

export const WithLogoAndUser: Story = {
  args: {
    logo: <strong>Acme</strong>,
    user: { name: "Jordan Lee", email: "jordan@acme.com" },
    links: basicLinks,
  },
};

export const WithSearch: Story = {
  args: {
    logo: <strong>Acme</strong>,
    search: { placeholder: "Search reservations..." },
    links: basicLinks,
  },
};

export const WithNestedLinks: Story = {
  args: {
    logo: <strong>Acme</strong>,
    links: nestedLinks,
  },
};

export const WithFooter: Story = {
  args: {
    logo: <strong>Acme</strong>,
    user: { name: "Jordan Lee", email: "jordan@acme.com" },
    links: basicLinks,
    footer: <span>v2.4.1</span>,
  },
};
