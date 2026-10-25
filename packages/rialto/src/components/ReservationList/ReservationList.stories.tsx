import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { ReservationList } from "./ReservationList";

const tonight = [
  { time: "6:00 PM", guest: "Lee Family", partySize: 2, status: "CONFIRMED" },
  { time: "7:30 PM", guest: "Maria Garcia", partySize: 4, status: "PENDING" },
  { time: "8:15 PM", partySize: 3, status: "CONFIRMED" },
  { time: "9:00 PM", guest: "Alexandra Montgomery-Whitfield", partySize: 6, status: "SEATED" },
];

const meta: Meta<typeof ReservationList> = {
  title: "Data Display/ReservationList",
  component: ReservationList,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof ReservationList>;

export const Default: Story = {
  args: { reservations: tonight },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const list = canvas.getByRole("list", { name: "Reservations" });
    await expect(list).toBeInTheDocument();
    await expect(canvas.getByText("Walk-in")).toBeInTheDocument();
  },
};

/** The chat drawer's width: rows fit with no horizontal scroll and long names wrap. */
export const ChatDrawerWidth: Story = {
  args: { reservations: tonight },
  decorators: [
    (Story) => (
      <div style={{ width: "300px" }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const list = within(canvasElement).getByRole("list", { name: "Reservations" });
    await expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth);
  },
};

/** One guest's bookings across dates, as the chat sends them: each time carries its date. */
export const MultiDate: Story = {
  args: {
    reservations: [
      { time: "Fri Oct 16, 7:30 PM", guest: "Maria Garcia", partySize: 4, status: "COMPLETED" },
      { time: "Mon Nov 2, 7:30 PM", guest: "Maria Garcia", partySize: 4, status: "CONFIRMED" },
    ],
  },
  decorators: [
    (Story) => (
      <div style={{ width: "300px" }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const list = within(canvasElement).getByRole("list", { name: "Reservations" });
    await expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth);
  },
};

export const UnknownStatus: Story = {
  args: {
    reservations: [{ time: "7:00 PM", guest: "Ana Ruiz", partySize: 2, status: "Running late" }],
  },
};
