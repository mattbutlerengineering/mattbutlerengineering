import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { GuestCards } from "./GuestCards";

const matches = [
  {
    name: "Maria Garcia",
    visits: 12,
    risk: "trusted",
    tags: ["VIP", "Regular", "Gluten-free", "Birthday"],
  },
  { name: "Tom Nguyen", visits: 1, risk: "standard" },
  { name: "Alexandra Montgomery-Whitfield", visits: 3, risk: "risky", tags: ["Large parties"] },
];

const meta: Meta<typeof GuestCards> = {
  title: "Data Display/GuestCards",
  component: GuestCards,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof GuestCards>;

export const Default: Story = {
  args: { guests: matches },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("list", { name: "Guests" })).toBeInTheDocument();
    await expect(canvas.getByText("12 visits")).toBeInTheDocument();
  },
};

/** The chat drawer's width: tags wrap and long names wrap with no horizontal scroll. */
export const ChatDrawerWidth: Story = {
  args: { guests: matches },
  decorators: [
    (Story) => (
      <div style={{ width: "300px" }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const list = within(canvasElement).getByRole("list", { name: "Guests" });
    await expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth);
  },
};

export const UnknownRisk: Story = {
  args: { guests: [{ name: "Ana Ruiz", visits: 2, risk: "Watch list" }] },
};
