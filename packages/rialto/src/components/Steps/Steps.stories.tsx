import type { Meta, StoryObj } from "@storybook/react-vite";
import { Steps, type StepItem } from "./Steps";

const meta: Meta<typeof Steps> = {
  title: "Layout/Steps",
  component: Steps,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    onStepClick: { action: "stepClicked" },
    orientation: {
      control: "select",
      options: ["horizontal", "vertical"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Steps>;

const checkoutSteps: StepItem[] = [
  { label: "Cart", description: "Review items" },
  { label: "Shipping", description: "Enter your address" },
  { label: "Payment", description: "Add a payment method" },
  { label: "Confirm", description: "Place your order" },
];

export const Horizontal: Story = {
  args: {
    steps: checkoutSteps,
    currentStep: 1,
  },
};

export const Vertical: Story = {
  args: {
    steps: checkoutSteps,
    currentStep: 2,
    orientation: "vertical",
  },
};

export const Compact: Story = {
  args: {
    steps: checkoutSteps,
    currentStep: 1,
    compact: true,
  },
};

export const AllCompleted: Story = {
  args: {
    steps: checkoutSteps,
    currentStep: checkoutSteps.length,
  },
};

export const Clickable: Story = {
  args: {
    steps: checkoutSteps,
    currentStep: 2,
    onStepClick: () => {},
  },
};
