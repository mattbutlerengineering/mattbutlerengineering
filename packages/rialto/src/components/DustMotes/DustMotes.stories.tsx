import type { Meta, StoryObj } from "@storybook/react-vite";
import { DustMotes } from "./DustMotes";
import { Heading } from "../Heading/Heading";
import { Text } from "../Text/Text";

const meta: Meta<typeof DustMotes> = {
  title: "Specialty/DustMotes",
  component: DustMotes,
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
type Story = StoryObj<typeof DustMotes>;

export const Default: Story = {};

export const BackRoomCover: Story = {
  render: (args) => (
    <div style={{ position: "relative", height: "100%" }}>
      <DustMotes {...args} />
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
          The back room
        </Heading>
        <Text variant="body">Low light, long tables, and nobody in a hurry.</Text>
      </div>
    </div>
  ),
};
