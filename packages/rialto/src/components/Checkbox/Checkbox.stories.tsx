import type { Meta, StoryObj } from "@storybook/react-vite";
import { within, expect } from "@storybook/test";
import { Checkbox, RadioGroup } from "./Checkbox";

const meta: Meta<typeof Checkbox> = {
  title: "Forms/Checkbox",
  component: Checkbox,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    onCheckedChange: { action: "checkedChange" },
    checked: { control: "boolean" },
    disabled: { control: "boolean" },
    indeterminate: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Unchecked: Story = {
  args: {
    label: "Accept terms and conditions",
    checked: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const checkbox = canvas.getByRole("checkbox");
    await expect(checkbox).toBeInTheDocument();
    await expect(checkbox).not.toBeChecked();
  },
};

export const Checked: Story = {
  args: {
    label: "Subscribe to newsletter",
    checked: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const checkbox = canvas.getByRole("checkbox");
    await expect(checkbox).toBeChecked();
  },
};

export const Indeterminate: Story = {
  args: {
    label: "Select all items",
    indeterminate: true,
    description: "3 of 7 items selected",
  },
};

export const WithDescription: Story = {
  args: {
    label: "Marketing emails",
    checked: false,
    description: "Receive product updates and promotional offers.",
  },
};

export const Disabled: Story = {
  args: {
    label: "Admin access",
    checked: false,
    disabled: true,
    disabledReason: "Contact your administrator to change this setting.",
  },
};

export const DisabledChecked: Story = {
  args: {
    label: "Required agreement",
    checked: true,
    disabled: true,
  },
};

const sizeOptions = [
  { value: "sm", label: "Small", description: "Compact" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large", disabled: true, disabledReason: "Sold out" },
];

export const RadioGroupOptions: StoryObj<typeof RadioGroup> = {
  render: () => (
    <RadioGroup
      label="Size"
      name="story-size"
      value="md"
      onChange={() => {}}
      options={sizeOptions}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("radio")).toHaveLength(3);
    await expect(canvas.getByLabelText("Medium")).toBeChecked();
  },
};

export const RadioGroupHorizontal: StoryObj<typeof RadioGroup> = {
  render: () => (
    <RadioGroup
      label="Size"
      name="story-size-h"
      value="sm"
      orientation="horizontal"
      onChange={() => {}}
      options={sizeOptions}
    />
  ),
};

export const RadioGroupError: StoryObj<typeof RadioGroup> = {
  render: () => (
    <RadioGroup
      label="Size"
      name="story-size-e"
      value=""
      required
      description="Pick one"
      error="Choose a size to continue"
      onChange={() => {}}
      options={sizeOptions}
    />
  ),
};

/**
 * Focus must bring the whole option into view, not just the hidden input (#9852). The input
 * used to be a 1px clipped box at the label's vertical middle: when that pixel was already
 * visible, focusing it scrolled nothing and a tall label stayed cut off at the scroll edge.
 */
export const RadioFocusScrollsWholeLabel: StoryObj<typeof RadioGroup> = {
  render: () => (
    <div data-testid="scroller" style={{ height: 120, width: 260, overflowY: "auto" }}>
      <div style={{ height: 200 }} />
      <RadioGroup
        label="When this date closes"
        name="story-focus-scroll"
        value=""
        onChange={() => {}}
        options={[
          {
            value: "cancel",
            label: "Cancel, notify and refund",
            description:
              "Guests get up to 3 open times in the next 14 days to rebook, and deposits go back.",
          },
          { value: "keep", label: "Keep and notify" },
        ]}
      />
      <div style={{ height: 200 }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const scroller = canvas.getByTestId("scroller");
    const radio = canvas.getByRole("radio", { name: /Cancel, notify and refund/ });
    const label = radio.closest("label")!;
    // Scroll so only the top half of the option shows: its middle sits just inside the bottom edge.
    const box = scroller.getBoundingClientRect();
    const mid = label.getBoundingClientRect().top + label.offsetHeight / 2;
    scroller.scrollTop += mid - (box.bottom - 4);
    radio.focus();
    const l = label.getBoundingClientRect();
    await expect(l.top).toBeGreaterThanOrEqual(box.top - 1);
    await expect(l.bottom).toBeLessThanOrEqual(box.bottom + 1);
  },
};
