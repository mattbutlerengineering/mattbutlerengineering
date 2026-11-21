import type { Meta, StoryObj } from "@storybook/react-vite";
import { Guilloche } from "./Guilloche";
import { Heading } from "../Heading/Heading";
import { Text } from "../Text/Text";

const meta: Meta<typeof Guilloche> = {
  title: "Specialty/Guilloche",
  component: Guilloche,
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
type Story = StoryObj<typeof Guilloche>;

export const Default: Story = {};

export const WithGiftCardOverlay: Story = {
  render: (args) => (
    <div style={{ position: "relative", height: "100%" }}>
      <Guilloche {...args} />
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
          Gift cards
        </Heading>
        <Text variant="body">Give an evening at the table.</Text>
      </div>
    </div>
  ),
};
