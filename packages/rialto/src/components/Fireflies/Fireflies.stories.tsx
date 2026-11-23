import type { Meta, StoryObj } from "@storybook/react-vite";
import { Fireflies } from "./Fireflies";
import { Heading } from "../Heading/Heading";
import { Text } from "../Text/Text";

const meta: Meta<typeof Fireflies> = {
  title: "Specialty/Fireflies",
  component: Fireflies,
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
type Story = StoryObj<typeof Fireflies>;

export const Default: Story = {};

export const PatioCover: Story = {
  render: (args) => (
    <div style={{ position: "relative", height: "100%" }}>
      <Fireflies {...args} />
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
          The patio at dusk
        </Heading>
        <Text variant="body">
          Warm evenings, a late table, and the lights coming on one by one.
        </Text>
      </div>
    </div>
  ),
};
