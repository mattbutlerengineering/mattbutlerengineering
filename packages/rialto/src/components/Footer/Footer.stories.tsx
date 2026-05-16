import type { Meta, StoryObj } from "@storybook/react-vite";
import { within, expect } from "@storybook/test";
import { Footer } from "./Footer";

const meta: Meta<typeof Footer> = {
  title: "Specialty/Footer",
  component: Footer,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Footer>;

export const Minimal: Story = {
  args: {
    variant: "minimal",
    children: <span>&copy; 2026 Acme Inc. All rights reserved.</span>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Acme Inc/)).toBeInTheDocument();
  },
};

export const Rich: Story = {
  args: {
    variant: "rich",
    logo: <span style={{ fontWeight: 500, fontSize: "1.25rem" }}>Acme</span>,
    columns: [
      {
        title: "Product",
        links: [
          { label: "Features", href: "#" },
          { label: "Pricing", href: "#" },
        ],
      },
      {
        title: "Company",
        links: [
          { label: "About", href: "#" },
          { label: "Careers", href: "#" },
        ],
      },
    ],
    copyright: "© 2026 Acme Inc.",
  },
};
