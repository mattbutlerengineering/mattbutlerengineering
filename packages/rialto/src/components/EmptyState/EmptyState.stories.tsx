import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { EmptyState } from "./EmptyState";
import { Button } from "../Button/Button";

const SearchIcon = (
  <svg
    viewBox="0 0 40 40"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="18" cy="18" r="10" />
    <path d="M26 26L36 36" />
  </svg>
);

const InboxIcon = (
  <svg
    viewBox="0 0 40 40"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="4" y="10" width="32" height="22" rx="2" />
    <path d="M4 22h8l4 6 4-6h16" />
  </svg>
);

const meta: Meta<typeof EmptyState> = {
  title: "Feedback/EmptyState",
  component: EmptyState,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["flat", "elevated"],
    },
    size: {
      control: { type: "radio" },
      options: ["sm", "md"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  args: {
    heading: "No items yet",
    description: "Get started by creating your first item.",
    action: <Button>Create item</Button>,
  },
};

export const NoResults: Story = {
  args: {
    icon: SearchIcon,
    heading: "No results found",
    description: "Try adjusting your search terms or clearing your filters.",
    action: (
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <Button variant="secondary">Clear filters</Button>
        <Button variant="ghost">Browse all</Button>
      </div>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const heading = canvas.getByText("No results found");
    await expect(heading).toBeInTheDocument();
    const buttons = canvas.getAllByRole("button");
    await expect(buttons).toHaveLength(2);
    await userEvent.click(buttons[0]);
  },
};

export const EmptyInbox: Story = {
  args: {
    icon: InboxIcon,
    heading: "Your inbox is empty",
    description: "When guests send messages, they'll appear here.",
  },
};

export const DefaultIcon: Story = {
  args: {
    heading: "No reservations",
    description: "Upcoming reservations will appear here once bookings are made.",
  },
};

export const Elevated: Story = {
  args: {
    variant: "elevated",
    heading: "Nothing here yet",
    description: "Start by adding your first record.",
    action: <Button>Add record</Button>,
  },
};

export const Small: Story = {
  args: {
    size: "sm",
    heading: "No items",
    description: "Add an item to get started.",
    action: <Button size="sm">Add</Button>,
  },
};

export const NoAction: Story = {
  args: {
    heading: "All caught up",
    description: "There are no pending notifications at this time.",
  },
};
