import type { Meta, StoryObj } from "@storybook/react-vite";
import { Contour } from "./Contour";
import { Heading } from "../Heading/Heading";
import { Text } from "../Text/Text";

const meta: Meta<typeof Contour> = {
  title: "Specialty/Contour",
  component: Contour,
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
type Story = StoryObj<typeof Contour>;

export const Default: Story = {};

export const WineListCover: Story = {
  render: (args) => (
    <div style={{ position: "relative", height: "100%" }}>
      <Contour {...args} />
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
          The wine list
        </Heading>
        <Text variant="body">Every bottle, mapped to the hillside it grew on.</Text>
      </div>
    </div>
  ),
};
