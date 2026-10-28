import type { Meta, StoryObj } from "@storybook/react-vite";
import { NeonSign } from "./NeonSign";
import { Stack } from "../Stack/Stack";

const meta: Meta<typeof NeonSign> = {
  title: "Data Display/NeonSign",
  component: NeonSign,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    state: {
      control: { type: "select" },
      options: ["open", "opening-soon", "closed", "unset"],
    },
    size: {
      control: { type: "select" },
      options: ["sm", "md", "lg"],
    },
    shape: {
      control: { type: "select" },
      options: ["classic", "swoosh", "boxed", "vertical", "arrow", "banner", "vintage"],
    },
    tone: { control: "object" },
    showCaption: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof NeonSign>;

export const Default: Story = {
  args: {
    "aria-label": "Open until 10:00 PM",
    state: "open",
  },
};

export const AllStates: Story = {
  render: () => (
    <Stack gap="xl">
      <NeonSign state="open" aria-label="Open until 10:00 PM" />
      <NeonSign state="opening-soon" aria-label="Opens at 5:00 PM" />
      <NeonSign state="closed" aria-label="Closed, opens Tuesday at 5:00 PM" />
      <NeonSign state="unset" aria-label="No operating hours set" />
    </Stack>
  ),
};

export const Sizes: Story = {
  render: () => (
    <Stack gap="xl">
      <NeonSign state="open" aria-label="Open until 10:00 PM" size="sm" />
      <NeonSign state="open" aria-label="Open until 10:00 PM" size="md" />
      <NeonSign state="open" aria-label="Open until 10:00 PM" size="lg" />
    </Stack>
  ),
};

const SHAPES = ["classic", "swoosh", "boxed", "vertical", "arrow", "banner", "vintage"] as const;
const STATES = ["open", "opening-soon", "closed", "unset"] as const;
const TONES = ["red", "pink", "blue", "green", "orange", "purple"] as const;

export const ShapesByState: Story = {
  render: () => (
    <Stack gap="xl">
      {SHAPES.map((shape) => (
        <Stack key={shape} direction="row" gap="xl" align="end" wrap>
          {STATES.map((state) => (
            <NeonSign
              key={state}
              shape={shape}
              state={state}
              aria-label={`${shape}, ${state}`}
              showCaption={false}
            />
          ))}
        </Stack>
      ))}
    </Stack>
  ),
};

export const ToneGrid: Story = {
  render: () => (
    <Stack direction="row" gap="xl" wrap>
      {TONES.map((word) => (
        <Stack key={word} gap="md">
          {TONES.map((frame) => (
            <NeonSign
              key={frame}
              shape="boxed"
              state="open"
              tone={{ word, frame }}
              aria-label={`${word} word, ${frame} frame`}
              showCaption={false}
              size="sm"
            />
          ))}
        </Stack>
      ))}
    </Stack>
  ),
};

export const WithoutCaption: Story = {
  args: {
    "aria-label": "Open until 10:00 PM",
    state: "open",
    showCaption: false,
  },
};
