import type { Meta, StoryObj } from "@storybook/react-vite";
import { Accordion } from "./Accordion";

const meta: Meta<typeof Accordion> = {
  title: "Layout/Accordion",
  component: Accordion,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Accordion>;

const sampleItems = [
  {
    id: "item-1",
    title: "What is Rialto?",
    content:
      "Rialto is a premium design system built with material honesty and precision surfaces.",
  },
  {
    id: "item-2",
    title: "How do I install it?",
    content: "Run npm install @mattbutlerengineering/rialto in your project.",
  },
  {
    id: "item-3",
    title: "Is it accessible?",
    content: "Yes. All components meet WCAG AA standards and support full keyboard navigation.",
  },
];

export const SingleExpand: Story = {
  args: {
    items: sampleItems,
    multiple: false,
  },
};

export const MultipleExpand: Story = {
  args: {
    items: sampleItems,
    multiple: true,
  },
};

export const DefaultOpen: Story = {
  args: {
    items: sampleItems,
    multiple: false,
    defaultOpen: ["item-1"],
  },
};

export const DefaultOpenMultiple: Story = {
  args: {
    items: sampleItems,
    multiple: true,
    defaultOpen: ["item-1", "item-3"],
  },
};

export const WithDisabledItem: Story = {
  args: {
    items: [
      ...sampleItems,
      {
        id: "item-4",
        title: "This item is disabled",
        content: "This content cannot be accessed.",
        disabled: true,
      },
    ],
    multiple: false,
  },
};
