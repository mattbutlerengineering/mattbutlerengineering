import type { Meta, StoryObj } from "@storybook/react-vite";
import { Ember } from "./Ember";
import { Heading } from "../Heading/Heading";
import { Text } from "../Text/Text";

const meta: Meta<typeof Ember> = {
  title: "Specialty/Ember",
  component: Ember,
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
type Story = StoryObj<typeof Ember>;

export const Default: Story = {};

export const HearthCover: Story = {
  render: (args) => (
    <div style={{ position: "relative", height: "100%" }}>
      <Ember {...args} />
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
          Tonight at the hearth
        </Heading>
        <Text variant="body">Wood-fired, sparks and all.</Text>
      </div>
    </div>
  ),
};
