import type { Meta, StoryObj } from "@storybook/react-vite";
import { Listbox } from "./Listbox";

const OPTIONS = [
  { value: "bar", label: "Bar" },
  { value: "patio", label: "Patio" },
  { value: "private", label: "Private dining", disabled: true },
  { value: "terrace", label: "Terrace" },
];

const meta: Meta<typeof Listbox> = {
  title: "Forms/Listbox",
  component: Listbox,
  tags: ["autodocs"],
  args: { "aria-label": "Seating section", options: OPTIONS },
};

export default meta;
type Story = StoryObj<typeof Listbox>;

export const Default: Story = {};

export const Multiple: Story = { args: { multiple: true, defaultValue: ["bar", "terrace"] } };

export const WithDisabledOption: Story = { args: { defaultValue: "patio" } };

export const Empty: Story = { args: { options: [] } };
