import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Combobox } from "./Combobox";

const FRAMEWORK_OPTIONS = [
  { value: "react", label: "React" },
  { value: "vue", label: "Vue" },
  { value: "angular", label: "Angular" },
  { value: "svelte", label: "Svelte" },
  { value: "solid", label: "SolidJS" },
  { value: "qwik", label: "Qwik" },
];

const meta: Meta<typeof Combobox> = {
  title: "Forms/Combobox",
  component: Combobox,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    onChange: { action: "changed" },
    onValuesChange: { action: "values changed" },
  },
  decorators: [
    (Story) => (
      <div style={{ width: "320px", minHeight: "280px" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Combobox>;

function SingleSelectDemo() {
  const [value, setValue] = useState("");
  return (
    <Combobox
      label="Framework"
      placeholder="Search frameworks…"
      options={FRAMEWORK_OPTIONS}
      value={value}
      onChange={setValue}
    />
  );
}

function MultiSelectDemo() {
  const [values, setValues] = useState<string[]>(["react"]);
  return (
    <Combobox
      label="Toppings"
      multiple
      placeholder="Add toppings…"
      options={FRAMEWORK_OPTIONS}
      values={values}
      onValuesChange={setValues}
    />
  );
}

export const SingleSelect: Story = {
  render: () => <SingleSelectDemo />,
};

export const MultiSelect: Story = {
  render: () => <MultiSelectDemo />,
};

export const Loading: Story = {
  args: {
    label: "Framework",
    placeholder: "Search frameworks…",
    options: [],
    loading: true,
  },
};

export const EmptyState: Story = {
  args: {
    label: "Language",
    placeholder: "Search languages…",
    options: [],
    inputValue: "COBOL",
    emptyText: "No matching languages found.",
  },
};

export const WithHintAndError: Story = {
  args: {
    label: "Framework",
    hint: "Choose the primary framework for this project.",
    error: true,
    required: true,
    placeholder: "Search frameworks…",
    options: FRAMEWORK_OPTIONS,
  },
};
