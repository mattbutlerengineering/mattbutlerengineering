import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Collapsible } from "./Collapsible";

const meta: Meta<typeof Collapsible> = {
  title: "Layout/Collapsible",
  component: Collapsible,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    onOpenChange: { action: "openChanged" },
    headingTag: {
      control: "select",
      options: [undefined, "h2", "h3", "h4", "h5", "h6"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Collapsible>;

export const Default: Story = {
  args: {
    trigger: "Show details",
    children: (
      <p>Rialto is a premium design system built with material honesty and precision surfaces.</p>
    ),
  },
};

export const DefaultOpen: Story = {
  args: {
    trigger: "Order summary",
    defaultOpen: true,
    children: <p>3 items, $42.00 subtotal, free shipping on orders over $50.</p>,
  },
};

export const Disabled: Story = {
  args: {
    trigger: "Locked section",
    disabled: true,
    children: <p>This content cannot be revealed right now.</p>,
  },
};

export const WithHeadingTag: Story = {
  args: {
    trigger: "Frequently asked question",
    headingTag: "h3",
    children: (
      <p>Wrapping the trigger in a heading improves document structure for screen readers.</p>
    ),
  },
};

function ControlledDemo() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <Collapsible trigger="Controlled section" open={open} onOpenChange={setOpen}>
        <p>Toggled externally via state at {open ? "open" : "closed"}.</p>
      </Collapsible>
      <button type="button" onClick={() => setOpen((prev) => !prev)}>
        Toggle from outside
      </button>
    </div>
  );
}

export const Controlled: Story = {
  render: () => <ControlledDemo />,
};
