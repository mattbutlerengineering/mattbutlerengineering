import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChatPanel } from "./ChatPanel";

const domainContext = {
  schemas: [
    { name: "Reservation", description: "A booking record", fields: "id, guestName, roomId" },
  ],
};

const meta: Meta<typeof ChatPanel> = {
  title: "Overlay/ChatPanel",
  component: ChatPanel,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    onClose: { action: "closed" },
    standalone: { control: "boolean" },
  },
  args: {
    // Not a real route — Storybook never calls it (only fires on user "send").
    api: "storybook-mock-agent-endpoint",
    domainContext,
    getAccessToken: () => "storybook-demo-token",
  },
};

export default meta;
type Story = StoryObj<typeof ChatPanel>;

export const AsDrawer: Story = {
  args: {
    standalone: false,
  },
};

export const Standalone: Story = {
  args: {
    standalone: true,
  },
  parameters: {
    layout: "padded",
  },
};
