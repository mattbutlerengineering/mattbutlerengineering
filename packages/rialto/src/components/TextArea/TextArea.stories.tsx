import type { Meta, StoryObj } from "@storybook/react-vite";
import { TextArea } from "./TextArea";

const meta: Meta<typeof TextArea> = {
  title: "Form/TextArea",
  component: TextArea,
  tags: ["autodocs"],
  argTypes: {
    error: { control: "boolean" },
    autoResize: { control: "boolean" },
    disabled: { control: "boolean" },
    required: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof TextArea>;

export const Default: Story = {
  args: {
    label: "Description",
    placeholder: "Enter details...",
  },
};

export const WithHint: Story = {
  args: {
    label: "Bio",
    hint: "Tell us a bit about yourself.",
    placeholder: "I am a software engineer...",
  },
};

export const WithCharacterCounter: Story = {
  args: {
    label: "Comment",
    maxLength: 100,
    placeholder: "Keep it short...",
  },
};

export const ErrorState: Story = {
  args: {
    label: "Feedback",
    error: true,
    hint: "This field is required.",
    value: "",
  },
};

export const AutoResize: Story = {
  args: {
    label: "Long Note",
    autoResize: true,
    placeholder: "Type a lot of text and see it grow...",
    rows: 1,
  },
};
