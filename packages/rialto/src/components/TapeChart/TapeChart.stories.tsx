import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, expect, within } from "storybook/test";
import { TapeChart } from "./TapeChart";
import type { TapeChartRoom, TapeChartReservation } from "./types";

const rooms: TapeChartRoom[] = [
  { id: "r101", name: "Room 101", category: "Standard", capacity: 2 },
  { id: "r102", name: "Room 102", category: "Standard", capacity: 2 },
  { id: "r201", name: "Room 201", category: "Deluxe", capacity: 2 },
  { id: "r202", name: "Room 202", category: "Deluxe", capacity: 3 },
  { id: "r301", name: "Suite 301", category: "Suite", capacity: 4 },
];

const reservations: TapeChartReservation[] = [
  {
    id: "res-1",
    roomId: "r101",
    start: "2026-05-03",
    end: "2026-05-07",
    status: "confirmed",
    guestName: "Max Verstappen",
    partySize: 2,
    ratePerNight: 18000,
    currency: "USD",
  },
  {
    id: "res-2",
    roomId: "r201",
    start: "2026-05-05",
    end: "2026-05-09",
    status: "checkedIn",
    guestName: "Lewis Hamilton",
    partySize: 1,
    ratePerNight: 25000,
    currency: "USD",
  },
  {
    id: "res-3",
    roomId: "r301",
    start: "2026-05-04",
    end: "2026-05-06",
    status: "tentative",
    guestName: "Carlos Sainz",
    partySize: 4,
    ratePerNight: 45000,
    currency: "USD",
  },
  {
    id: "res-4",
    roomId: "r102",
    start: "2026-05-06",
    end: "2026-05-10",
    status: "confirmed",
    guestName: "Fernando Alonso",
    partySize: 2,
    ratePerNight: 18000,
    currency: "USD",
  },
  {
    id: "res-5",
    roomId: "r202",
    start: "2026-05-03",
    end: "2026-05-05",
    status: "checkedOut",
    guestName: "Charles Leclerc",
    partySize: 2,
    ratePerNight: 25000,
    currency: "USD",
  },
];

const meta: Meta<typeof TapeChart> = {
  title: "Data Display/TapeChart",
  component: TapeChart,
  tags: ["autodocs"],
  argTypes: {
    density: {
      control: { type: "radio" },
      options: ["compact", "comfortable"],
    },
    loading: { control: "boolean" },
  },
  args: {
    onReservationClick: fn(),
  },
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof TapeChart>;

export const Default: Story = {
  args: {
    rooms,
    reservations,
    startDate: "2026-05-03",
    endDate: "2026-05-11",
    currency: "USD",
    locale: "en-US",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const region = canvas.getByRole("region");
    await expect(region).toBeInTheDocument();
  },
};

export const Compact: Story = {
  args: {
    rooms,
    reservations,
    startDate: "2026-05-03",
    endDate: "2026-05-11",
    currency: "USD",
    density: "compact",
  },
};

export const Loading: Story = {
  args: {
    rooms,
    reservations: [],
    startDate: "2026-05-03",
    endDate: "2026-05-11",
    loading: true,
  },
};

export const Empty: Story = {
  args: {
    rooms,
    reservations: [],
    startDate: "2026-05-03",
    endDate: "2026-05-11",
  },
};

export const WithError: Story = {
  args: {
    rooms,
    reservations: [],
    startDate: "2026-05-03",
    endDate: "2026-05-11",
    error: new Error("Failed to load reservations. Please try again."),
    onRetry: fn(),
  },
};
