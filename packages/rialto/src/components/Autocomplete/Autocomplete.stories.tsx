import type { Meta, StoryObj } from "@storybook/react-vite";
import { Autocomplete } from "./Autocomplete";

const FRAMEWORK_OPTIONS = [
  { value: "react", label: "React" },
  { value: "vue", label: "Vue" },
  { value: "angular", label: "Angular" },
  { value: "svelte", label: "Svelte" },
  { value: "solid", label: "SolidJS" },
  { value: "qwik", label: "Qwik" },
  { value: "astro", label: "Astro" },
  { value: "remix", label: "Remix" },
];

const meta: Meta<typeof Autocomplete> = {
  title: "Forms/Autocomplete",
  component: Autocomplete,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    onChange: { action: "changed" },
    onSelect: { action: "selected" },
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
type Story = StoryObj<typeof Autocomplete>;

export const Default: Story = {
  args: {
    label: "Framework",
    placeholder: "Search frameworks…",
    options: FRAMEWORK_OPTIONS,
  },
};

export const WithFiltering: Story = {
  args: {
    label: "Framework",
    placeholder: "Type to filter…",
    options: FRAMEWORK_OPTIONS,
    hint: "Type at least one character to see results.",
  },
};

export const EmptyState: Story = {
  args: {
    label: "Language",
    placeholder: "Search languages…",
    options: [],
    value: "COBOL",
    emptyText: "No matching languages found.",
  },
};

export const WithHint: Story = {
  args: {
    label: "Tech stack",
    placeholder: "Search…",
    options: FRAMEWORK_OPTIONS,
    hint: "Select the primary framework for your project.",
    showOptional: true,
  },
};

export const Required: Story = {
  args: {
    label: "Framework",
    placeholder: "Select a framework…",
    options: FRAMEWORK_OPTIONS,
    required: true,
  },
};
