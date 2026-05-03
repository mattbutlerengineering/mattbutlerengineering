import type { Meta, StoryObj } from "@storybook/react-vite";
import { Heading } from "./Heading";

const meta: Meta<typeof Heading> = {
  title: "Foundation/Heading",
  component: Heading,
  tags: ["autodocs"],
  argTypes: {
    level: {
      control: { type: "select" },
      options: [1, 2, 3, 4, 5, 6],
    },
    size: {
      control: { type: "select" },
      options: [1, 2, 3, 4, 5, 6],
    },
    color: {
      control: { type: "select" },
      options: [
        "primary",
        "secondary",
        "tertiary",
        "accent",
        "success",
        "warning",
        "error",
        "on-accent",
      ],
    },
    align: {
      control: { type: "radio" },
      options: ["left", "center", "right"],
    },
    truncate: {
      control: "boolean",
    },
  },
};

export default meta;
type Story = StoryObj<typeof Heading>;

export const Default: Story = {
  args: {
    children: "The quick brown fox",
    level: 2,
  },
};

export const Levels: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <Heading level={1}>Heading 1</Heading>
      <Heading level={2}>Heading 2</Heading>
      <Heading level={3}>Heading 3</Heading>
      <Heading level={4}>Heading 4</Heading>
      <Heading level={5}>Heading 5</Heading>
      <Heading level={6}>Heading 6</Heading>
    </div>
  ),
};

export const Colors: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <Heading color="primary">Primary Heading</Heading>
      <Heading color="secondary">Secondary Heading</Heading>
      <Heading color="accent">Accent Heading</Heading>
      <Heading color="success">Success Heading</Heading>
      <Heading color="warning">Warning Heading</Heading>
      <Heading color="error">Error Heading</Heading>
    </div>
  ),
};

export const SizeOverride: Story = {
  args: {
    level: 2,
    size: 1,
    children: "Semantic H2, Visual Size 1",
  },
};
