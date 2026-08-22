import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tabs, type Tab } from "./Tabs";

const meta: Meta<typeof Tabs> = {
  title: "Layout/Tabs",
  component: Tabs,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    onTabChange: { action: "tabChanged" },
  },
};

export default meta;
type Story = StoryObj<typeof Tabs>;

const basicTabs: Tab[] = [
  { id: "overview", label: "Overview", content: <p>Overview content goes here.</p> },
  { id: "activity", label: "Activity", content: <p>Recent activity is listed here.</p> },
  { id: "settings", label: "Settings", content: <p>Account settings live here.</p> },
];

const withDisabledTabs: Tab[] = [
  { id: "one", label: "First", content: <p>First panel.</p> },
  { id: "two", label: "Second", content: <p>Second panel.</p>, disabled: true },
  { id: "three", label: "Third", content: <p>Third panel.</p> },
];

export const Default: Story = {
  args: {
    tabs: basicTabs,
  },
};

export const WithDefaultTab: Story = {
  args: {
    tabs: basicTabs,
    defaultTab: "activity",
  },
};

export const WithDisabledTab: Story = {
  args: {
    tabs: withDisabledTabs,
  },
};

export const TwoTabs: Story = {
  args: {
    tabs: [
      { id: "list", label: "List", content: <p>List view content.</p> },
      { id: "grid", label: "Grid", content: <p>Grid view content.</p> },
    ],
  },
};
