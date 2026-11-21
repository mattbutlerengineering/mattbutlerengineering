import type { Meta, StoryObj } from "@storybook/react-vite";
import { Champagne } from "./Champagne";
import { Heading } from "../Heading/Heading";
import { Text } from "../Text/Text";

const meta: Meta<typeof Champagne> = {
  title: "Specialty/Champagne",
  component: Champagne,
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
type Story = StoryObj<typeof Champagne>;

export const Default: Story = {};

export const TastingMenuCover: Story = {
  render: (args) => (
    <div style={{ position: "relative", height: "100%" }}>
      <Champagne {...args} />
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
          Tonight&apos;s pour
        </Heading>
        <Text variant="body">Cold, dry, and rising to the occasion.</Text>
      </div>
    </div>
  ),
};
