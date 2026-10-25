import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { TimeSlots } from "./TimeSlots";

const friday = ["5:30 PM", "6:00 PM", "6:15 PM", "7:45 PM", "8:00 PM", "8:30 PM", "9:00 PM"];

const meta: Meta<typeof TimeSlots> = {
  title: "Data Display/TimeSlots",
  component: TimeSlots,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof TimeSlots>;

export const Default: Story = {
  args: { date: "Friday, Oct 30", partySize: 4, times: friday },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Friday, Oct 30 · Party of 4")).toBeInTheDocument();
    await expect(canvas.getByRole("list", { name: "Open times" })).toBeInTheDocument();
  },
};

/** The chat drawer's width: times wrap onto more lines with no horizontal scroll. */
export const ChatDrawerWidth: Story = {
  args: { date: "Friday, Oct 30", partySize: 4, times: friday },
  decorators: [
    (Story) => (
      <div style={{ width: "300px" }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const list = within(canvasElement).getByRole("list", { name: "Open times" });
    await expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth);
  },
};

export const NoOpenTimes: Story = {
  args: { date: "Saturday, Oct 31", partySize: 6, times: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("No open times")).toBeInTheDocument();
  },
};
