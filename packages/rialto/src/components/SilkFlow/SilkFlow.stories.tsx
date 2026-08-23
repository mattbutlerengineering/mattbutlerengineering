import type { Meta, StoryObj } from "@storybook/react-vite";
import { SilkFlow } from "./SilkFlow";
import { Heading } from "../Heading/Heading";
import { Text } from "../Text/Text";

const meta: Meta<typeof SilkFlow> = {
  title: "Specialty/SilkFlow",
  component: SilkFlow,
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
type Story = StoryObj<typeof SilkFlow>;

export const Default: Story = {};

export const WithHeroOverlay: Story = {
  render: (args) => (
    <div style={{ position: "relative", height: "100%" }}>
      <SilkFlow {...args} />
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
          Rialto
        </Heading>
        <Text variant="body">A design system for teams that value precision and warmth.</Text>
      </div>
    </div>
  ),
};
