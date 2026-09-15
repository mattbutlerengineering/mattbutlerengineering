import type { Meta, StoryObj } from "@storybook/react-vite";
import { within, expect, userEvent } from "@storybook/test";
import { CommandPalette } from "./CommandPalette";

const meta: Meta<typeof CommandPalette> = {
  title: "Specialty/CommandPalette",
  component: CommandPalette,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof CommandPalette>;

const sampleItems = [
  { id: "new-file", label: "New File", group: "Actions" },
  { id: "open-file", label: "Open File", group: "Actions" },
  { id: "save", label: "Save", group: "Actions" },
  { id: "settings", label: "Settings", group: "Navigation" },
  { id: "dashboard", label: "Dashboard", group: "Navigation" },
];

export const Open: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    items: sampleItems,
    placeholder: "Type a command...",
    groups: ["Actions", "Navigation"],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByPlaceholderText("Type a command...")).toBeInTheDocument();
  },
};

export const Closed: Story = {
  args: {
    open: false,
    onOpenChange: () => {},
    items: sampleItems,
  },
};

const rankedItems = [
  { id: "walk-in", label: "Walk-in guest", group: "Actions" },
  { id: "new-reservation", label: "New reservation", group: "Actions" },
  { id: "waitlist", label: "Waitlist", group: "Navigation" },
  { id: "walkway", label: "Show walkway map", group: "Navigation" },
];

/**
 * Results rank by match strength, not `items` order: a label that starts with
 * the query beats a later word that starts with it, beats a substring, beats
 * strict initials; groups reorder by the best match they contain. Type "walk"
 * — "Walk-in guest" (Actions) leads, "Show walkway map" follows, and "Waitlist"
 * no longer appears (its old loose initials match is gone).
 */
export const RankedResults: Story = {
  name: "Ranked results",
  args: {
    open: true,
    onOpenChange: () => {},
    items: rankedItems,
    placeholder: 'Type "walk"',
    groups: ["Navigation", "Actions"],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("combobox"), "walk");
    const options = canvas.getAllByRole("option");
    await expect(options[0]).toHaveTextContent("Walk-in guest");
    await expect(options[1]).toHaveTextContent("Show walkway map");
    await expect(canvas.queryByText("Waitlist")).not.toBeInTheDocument();
  },
};
