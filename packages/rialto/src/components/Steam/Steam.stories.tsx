import type { Meta, StoryObj } from "@storybook/react-vite";
import { Steam } from "./Steam";
import { Heading } from "../Heading/Heading";
import { Text } from "../Text/Text";

const meta: Meta<typeof Steam> = {
  title: "Specialty/Steam",
  component: Steam,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ position: "relative", height: "60vh", overflow: "hidden" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Steam>;

export const Default: Story = {};

export const PassCover: Story = {
  render: (args) => (
    <div style={{ position: "relative", height: "100%" }}>
      <Steam {...args} />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          textAlign: "center",
          gap: "8px",
        }}
      >
        <Heading level={1} size={2}>
          Fresh off the pass
        </Heading>
        <Text variant="body">
          The kitchen is warm, the coffee is on, and the room is waking up.
        </Text>
      </div>
    </div>
  ),
};
