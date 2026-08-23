import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { ErrorBoundary } from "./ErrorBoundary";

function ThrowingChild(): never {
  throw new Error("Simulated render error for Storybook");
}

const meta: Meta<typeof ErrorBoundary> = {
  title: "Feedback/ErrorBoundary",
  component: ErrorBoundary,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    headingLevel: {
      control: { type: "select" },
      options: [1, 2, 3, 4, 5, 6],
    },
  },
};

export default meta;
type Story = StoryObj<typeof ErrorBoundary>;

export const NoError: Story = {
  args: {
    children: <div>Everything is fine — this is the normal child content.</div>,
  },
};

export const DefaultFallback: Story = {
  args: {
    children: <ThrowingChild />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Something went wrong")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
  },
};

export const CustomFallback: Story = {
  args: {
    children: <ThrowingChild />,
    fallback: <div>Custom recovery UI — try again later.</div>,
  },
};
