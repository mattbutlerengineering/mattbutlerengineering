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

// Overlap scenario — an inline copy of apps/rialto-web's makeOverlapScenario()
// (the library cannot import from the app). Week of Mon 2026-03-02.
const overlapRooms: TapeChartRoom[] = [
  { id: "ov-201", name: "201", category: "Standard", capacity: 2 },
  { id: "ov-202", name: "202", category: "Deluxe", capacity: 3 },
  { id: "ov-dorm-a", name: "Dorm A", category: "Dorm", capacity: 6 },
  { id: "ov-203", name: "203", category: "Standard", capacity: 2 },
];

const overlapBase = { currency: "USD", source: "Direct" } as const;
const overlapReservations: TapeChartReservation[] = [
  {
    ...overlapBase,
    id: "ov-a",
    roomId: "ov-201",
    start: "2026-03-02",
    end: "2026-03-06",
    status: "confirmed",
    guestName: "Marisol Vega",
    partySize: 2,
    ratePerNight: 18000,
  },
  {
    ...overlapBase,
    id: "ov-b",
    roomId: "ov-201",
    start: "2026-03-04",
    end: "2026-03-08",
    status: "confirmed",
    guestName: "Tobias Lindqvist",
    partySize: 1,
    ratePerNight: 18000,
  },
  {
    ...overlapBase,
    id: "ov-c",
    roomId: "ov-202",
    start: "2026-03-02",
    end: "2026-03-07",
    status: "checkedIn",
    guestName: "Harriet Okafor",
    partySize: 2,
    ratePerNight: 24000,
  },
  {
    ...overlapBase,
    id: "ov-d",
    roomId: "ov-202",
    start: "2026-03-03",
    end: "2026-03-06",
    status: "tentative",
    guestName: "Elias Brandt",
    partySize: 3,
    ratePerNight: 24000,
  },
  {
    ...overlapBase,
    id: "ov-e",
    roomId: "ov-202",
    start: "2026-03-05",
    end: "2026-03-09",
    status: "confirmed",
    guestName: "Nadia Petrova",
    partySize: 2,
    ratePerNight: 24000,
  },
  {
    ...overlapBase,
    id: "ov-f",
    roomId: "ov-dorm-a",
    start: "2026-03-02",
    end: "2026-03-05",
    status: "confirmed",
    guestName: "Oscar Delacroix",
    partySize: 1,
    ratePerNight: 4500,
  },
  {
    ...overlapBase,
    id: "ov-g",
    roomId: "ov-dorm-a",
    start: "2026-03-02",
    end: "2026-03-06",
    status: "confirmed",
    guestName: "Wren Castellano",
    partySize: 1,
    ratePerNight: 4500,
  },
  {
    ...overlapBase,
    id: "ov-h",
    roomId: "ov-dorm-a",
    start: "2026-03-03",
    end: "2026-03-07",
    status: "confirmed",
    guestName: "Imani Adeyemi",
    partySize: 1,
    ratePerNight: 4500,
  },
  {
    ...overlapBase,
    id: "ov-i",
    roomId: "ov-203",
    start: "2026-03-03",
    end: "2026-03-07",
    status: "confirmed",
    guestName: "Lucas Moreau",
    partySize: 2,
    ratePerNight: 18000,
  },
];

const classifyDorm = (a: TapeChartReservation, _b: TapeChartReservation) =>
  overlapRooms.find((r) => r.id === a.roomId)?.category === "Dorm"
    ? ("shared" as const)
    : ("conflict" as const);

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

export const Overlaps: Story = {
  args: {
    rooms: overlapRooms,
    reservations: overlapReservations,
    startDate: "2026-03-02",
    endDate: "2026-03-09",
    currency: "USD",
    locale: "en-US",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: /Marisol Vega/ })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /Tobias Lindqvist/ })).toBeInTheDocument();
  },
};

export const OverlapsClassified: Story = {
  args: {
    rooms: overlapRooms,
    reservations: overlapReservations,
    startDate: "2026-03-02",
    endDate: "2026-03-09",
    currency: "USD",
    locale: "en-US",
    classifyOverlap: classifyDorm,
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
