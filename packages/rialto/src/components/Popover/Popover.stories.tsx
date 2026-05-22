import type { Meta, StoryObj } from "@storybook/react-vite";
import { Popover } from "./Popover";
import { Button } from "../Button/Button";
import { Text } from "../Text/Text";
import { Stack } from "../Stack/Stack";
import { within, userEvent, expect } from "@storybook/test";

const meta: Meta<typeof Popover> = {
  title: "Overlay/Popover",
  component: Popover,
  tags: ["autodocs"],
  argTypes: {
    placement: {
      control: { type: "select" },
      options: ["top", "bottom", "left", "right"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Popover>;

export const Default: Story = {
  render: () => (
    <Popover trigger={<Button variant="ghost">Options</Button>} title="Filter Settings">
      <Stack gap="sm">
        <Text>Show online only</Text>
        <Text>Hide inactive users</Text>
        <Text>Group by status</Text>
      </Stack>
    </Popover>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Options" });
    await userEvent.click(button);
    await expect(canvas.getByText("Filter Settings")).toBeInTheDocument();
  },
};

export const Placements: Story = {
  render: () => (
    <div
      style={{
        display: "flex",
        gap: "2rem",
        padding: "2rem",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Popover trigger={<Button size="sm">Top</Button>} placement="top">
        <Text>Top popover content</Text>
      </Popover>
      <Popover trigger={<Button size="sm">Bottom</Button>} placement="bottom">
        <Text>Bottom popover content</Text>
      </Popover>
      <Popover trigger={<Button size="sm">Left</Button>} placement="left">
        <Text>Left popover content</Text>
      </Popover>
      <Popover trigger={<Button size="sm">Right</Button>} placement="right">
        <Text>Right popover content</Text>
      </Popover>
    </div>
  ),
};

export const WithRichContent: Story = {
  render: () => (
    <Popover trigger={<Button variant="ghost">View Details</Button>} title="User Details">
      <Stack gap="sm" style={{ padding: "0.5rem" }}>
        <Text variant="label">John Doe</Text>
        <Text variant="caption" color="secondary">
          john@example.com
        </Text>
        <Text variant="detail" color="tertiary">
          Last seen 5 min ago
        </Text>
      </Stack>
    </Popover>
  ),
};
