import type { Meta, StoryObj } from "@storybook/react-vite";
import { Constellation } from "./Constellation";
import { Heading } from "../Heading/Heading";
import { Text } from "../Text/Text";

const meta: Meta<typeof Constellation> = {
  title: "Specialty/Constellation",
  component: Constellation,
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
type Story = StoryObj<typeof Constellation>;

export const Default: Story = {};

export const NetworkCover: Story = {
  render: (args) => (
    <div style={{ position: "relative", height: "100%" }}>
      <Constellation {...args} />
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
          Everyone at the table
        </Heading>
        <Text variant="body">Regulars, friends of friends, and the web that brings them back.</Text>
      </div>
    </div>
  ),
};
