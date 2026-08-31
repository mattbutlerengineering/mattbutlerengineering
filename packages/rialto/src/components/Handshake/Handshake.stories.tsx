import type { Meta, StoryObj } from "@storybook/react-vite";
import { Handshake } from "./Handshake";
import { Stack } from "../Stack/Stack";

const meta: Meta<typeof Handshake> = {
  title: "Data Display/Handshake",
  component: Handshake,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    state: {
      control: { type: "select" },
      options: ["idle", "negotiating", "settled", "failed"],
    },
    size: {
      control: { type: "select" },
      options: ["sm", "md", "lg"],
    },
    lane: { control: { type: "number", min: 0 } },
    showLabels: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof Handshake>;

export const Default: Story = {
  args: {
    "aria-label": "Verifying your sign-in",
    stations: ["Browser", "Identity"],
    state: "negotiating",
  },
};

export const AllStates: Story = {
  render: () => (
    <Stack gap="xl">
      <Handshake aria-label="Idle" stations={["Browser", "Identity"]} state="idle" />
      <Handshake aria-label="Negotiating" stations={["Browser", "Identity"]} state="negotiating" />
      <Handshake aria-label="Settled" stations={["Browser", "Identity"]} state="settled" />
      <Handshake aria-label="Failed" stations={["Browser", "Identity"]} state="failed" />
    </Stack>
  ),
};

export const ThreeStations: Story = {
  args: {
    "aria-label": "Exchanging the authorization code for tokens",
    stations: ["Browser", "Identity", "API"],
    lane: 1,
  },
};

export const Sizes: Story = {
  render: () => (
    <Stack gap="xl">
      <Handshake aria-label="Small" stations={["Browser", "Identity"]} size="sm" />
      <Handshake aria-label="Medium" stations={["Browser", "Identity"]} size="md" />
      <Handshake aria-label="Large" stations={["Browser", "Identity"]} size="lg" />
    </Stack>
  ),
};

export const WithoutLabels: Story = {
  args: {
    "aria-label": "Pairing",
    stations: ["Phone", "Watch"],
    showLabels: false,
  },
};
