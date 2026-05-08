import type { Meta, StoryObj } from "@storybook/react-vite";
import { within, expect } from "@storybook/test";
import { ScrollArea } from "./ScrollArea";

const meta: Meta<typeof ScrollArea> = {
  title: "Specialty/ScrollArea",
  component: ScrollArea,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof ScrollArea>;

export const Default: Story = {
  args: {
    maxHeight: 200,
    children: (
      <div>
        {Array.from({ length: 20 }, (_, i) => (
          <p key={i} style={{ margin: "0.5rem 0" }}>
            Scrollable item {i + 1}
          </p>
        ))}
      </div>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Scrollable item 1")).toBeInTheDocument();
  },
};

export const Tall: Story = {
  args: {
    maxHeight: 400,
    children: (
      <div>
        {Array.from({ length: 50 }, (_, i) => (
          <p key={i} style={{ margin: "0.25rem 0" }}>
            Line {i + 1}
          </p>
        ))}
      </div>
    ),
  },
};
