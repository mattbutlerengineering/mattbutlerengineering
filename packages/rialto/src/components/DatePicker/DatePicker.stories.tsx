import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { within, userEvent, expect } from "@storybook/test";
import { DatePicker } from "./DatePicker";

const meta: Meta<typeof DatePicker> = {
  title: "Forms/DatePicker",
  component: DatePicker,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    onChange: { action: "changed" },
    placement: {
      control: "select",
      options: ["top", "bottom", "left", "right"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof DatePicker>;

function DefaultDemo() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <DatePicker
      label="Check-in"
      placeholder="Select a date"
      value={value}
      onChange={setValue}
      locale="en-US"
    />
  );
}

function WithBoundsDemo() {
  const [value, setValue] = useState<string | null>("2026-07-15");
  return (
    <DatePicker
      label="Booking date"
      value={value}
      onChange={setValue}
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
    const trigger = canvas.getByLabelText("Check-in");
    await userEvent.click(trigger);
    await expect(within(document.body).getByRole("grid")).toBeInTheDocument();
  },
};

export const WithBounds: Story = {
  render: () => <WithBoundsDemo />,
};

function EditableRangeDemo() {
  const [start, setStart] = useState<string | null>("2026-12-21");
  const [end, setEnd] = useState<string | null>(null);
  return (
    <div style={{ display: "flex", gap: "var(--rialto-space-md)" }}>
      <DatePicker label="From" value={start} onChange={setStart} locale="en-US" editable />
      <DatePicker
        label="To"
        value={end}
        onChange={setEnd}
        locale="en-US"
        editable
        defaultMonth={start ?? undefined}
      />
    </div>
  );
}

/**
 * `editable` lets the date be typed (`Dec 26`, `12/26/2026`, `2026-12-26`); the
 * calendar opens on ArrowDown or from the calendar button. The empty "To"
 * field's calendar opens on the "From" date's month through `defaultMonth`.
 */
export const Editable: Story = {
  render: () => <EditableRangeDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const end = canvas.getByLabelText("To");
    await userEvent.type(end, "not a date{Enter}");
    await expect(end).toHaveAttribute("aria-invalid", "true");
    await userEvent.clear(end);
    await userEvent.type(end, "12/26/2026{Enter}");
    await expect(end).toHaveValue("Dec 26, 2026");
  },
};
