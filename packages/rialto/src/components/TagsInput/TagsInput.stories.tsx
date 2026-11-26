import type { Meta, StoryObj } from "@storybook/react-vite";
import { within, expect } from "@storybook/test";
import { TagsInput } from "./TagsInput";

const meta: Meta<typeof TagsInput> = {
  title: "Forms/TagsInput",
  component: TagsInput,
  tags: ["autodocs"],
  args: { label: "Dietary notes" },
};

export default meta;
type Story = StoryObj<typeof TagsInput>;

export const Default: Story = {
  args: { placeholder: "Type and press Enter" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Dietary notes")).toBeInTheDocument();
  },
};

export const WithTags: Story = { args: { defaultValue: ["vegan", "nut allergy"] } };

export const MaxTags: Story = { args: { defaultValue: ["a", "b"], maxTags: 2 } };

export const AllowDuplicates: Story = { args: { defaultValue: ["vip"], allowDuplicates: true } };

export const WithError: Story = {
  args: { defaultValue: ["vegan"], error: true, hint: "Check the dietary notes" },
};

export const Disabled: Story = { args: { defaultValue: ["vegan"], disabled: true } };
