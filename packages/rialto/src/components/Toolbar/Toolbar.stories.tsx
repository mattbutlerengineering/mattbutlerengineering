import type { Meta, StoryObj } from "@storybook/react-vite";
import { Toolbar, ToolbarSeparator } from "./Toolbar";
import { Button } from "../Button/Button";

const meta: Meta<typeof Toolbar> = {
  title: "Navigation/Toolbar",
  component: Toolbar,
  tags: ["autodocs"],
  argTypes: {
    orientation: { control: "inline-radio", options: ["horizontal", "vertical"] },
  },
};

export default meta;
type Story = StoryObj<typeof Toolbar>;

export const Default: Story = {
  args: { "aria-label": "Formatting" },
  render: (args) => (
    <Toolbar {...args}>
      <Button variant="ghost">Bold</Button>
      <Button variant="ghost">Italic</Button>
      <ToolbarSeparator />
      <Button variant="ghost">Link</Button>
    </Toolbar>
  ),
};

export const Vertical: Story = {
  args: { "aria-label": "Table actions", orientation: "vertical" },
  render: (args) => (
    <Toolbar {...args}>
      <Button variant="ghost">Seat</Button>
      <Button variant="ghost">Move</Button>
      <ToolbarSeparator toolbarOrientation="vertical" />
      <Button variant="ghost">Cancel</Button>
    </Toolbar>
  ),
};

export const WithDisabledControl: Story = {
  args: { "aria-label": "Booking actions" },
  render: (args) => (
    <Toolbar {...args}>
      <Button variant="ghost">Confirm</Button>
      <Button variant="ghost" disabled>
        Refund
      </Button>
      <Button variant="ghost">Notes</Button>
    </Toolbar>
  ),
};
