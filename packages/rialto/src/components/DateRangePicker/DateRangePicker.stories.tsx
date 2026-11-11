import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { within, userEvent, expect } from "@storybook/test";
import { DateRange } from "../DateRange/DateRange";
import { DateRangePicker } from "./DateRangePicker";
import type { DateRangeValue } from "../DateRange/DateRange";

const meta: Meta<typeof DateRangePicker> = {
  title: "Forms/DateRangePicker",
  component: DateRangePicker,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof DateRangePicker>;

function DefaultDemo() {
  const [range, setRange] = useState<DateRangeValue>({ start: null, end: null });
  return <DateRangePicker label="Stay dates" value={range} onChange={setRange} locale="en-US" />;
}

function WithBoundsDemo() {
  const [range, setRange] = useState<DateRangeValue>({
    start: "2026-07-10",
    end: "2026-07-15",
  });
  return (
    <DateRangePicker
      label="Booking dates"
      value={range}
      onChange={setRange}
      min="2026-07-01"
      max="2026-08-31"
      locale="en-US"
    />
  );
}

export const Default: Story = {
  render: () => <DefaultDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByLabelText("Stay dates");
    await userEvent.click(trigger);
    await expect(canvas.getByRole("grid")).toBeInTheDocument();
  },
};

/** The popover panel sizes itself from the calendar: cells must stay 34px. */
export const PopoverKeepsDayCellWidth: Story = {
  render: () => <DefaultDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByLabelText("Stay dates"));
    const grid = await within(document.body).findByRole("grid");
    const day = grid.querySelector<HTMLElement>("[data-date]");
    await expect(day).not.toBeNull();
    const width = day!.offsetWidth;
    await expect(`${width}px`).toBe("34px");
  },
};

export const WithBounds: Story = {
  render: () => <WithBoundsDemo />,
};

const EMPTY_RANGE: DateRangeValue = { start: "2026-07-15", end: "2026-07-19" };

function InlineCalendar({ width }: { width: string }) {
  return (
    <div data-testid="host" style={{ width }}>
      <DateRange value={EMPTY_RANGE} onChange={() => undefined} locale="en-US" />
    </div>
  );
}

function calendarMetrics(canvasElement: HTMLElement) {
  const grid = canvasElement.querySelector<HTMLElement>("[role='grid']");
  const calendar = grid?.parentElement;
  const day = grid?.querySelector<HTMLElement>("[data-date]");
  if (!calendar || !day) throw new Error("calendar not rendered");
  return {
    calendar: calendar.offsetWidth,
    day: day.offsetWidth,
  };
}

/** A block parent with room keeps the 34px cells. */
export const BlockParentKeepsDayCellWidth: Story = {
  render: () => <InlineCalendar width="400px" />,
  play: async ({ canvasElement }) => {
    const { day, calendar } = calendarMetrics(canvasElement);
    await expect(day).toBe(34);
    await expect(calendar).toBe(266);
  },
};

/** A container narrower than seven fixed columns shrinks the calendar to fit. */
export const NarrowContainerShrinksCalendar: Story = {
  render: () => <InlineCalendar width="220px" />,
  play: async ({ canvasElement }) => {
    const { day, calendar } = calendarMetrics(canvasElement);
    await expect(calendar).toBeLessThanOrEqual(220);
    await expect(day).toBeLessThan(34);
  },
};
