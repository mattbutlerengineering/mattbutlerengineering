import type { Meta, StoryObj } from "@storybook/react-vite";
import { DataTable } from "./DataTable";

interface Driver {
  name: string;
  team: string;
  points: number;
  wins: number;
}

const drivers: Driver[] = [
  { name: "Max Verstappen", team: "Red Bull Racing", points: 575, wins: 19 },
  { name: "Sergio Perez", team: "Red Bull Racing", points: 285, wins: 2 },
  { name: "Lewis Hamilton", team: "Mercedes", points: 234, wins: 0 },
  { name: "Carlos Sainz", team: "Ferrari", points: 200, wins: 1 },
  { name: "Fernando Alonso", team: "Aston Martin", points: 206, wins: 0 },
];

const columns = [
  { key: "name", header: "Driver", sortable: true, rowHeader: true },
  { key: "team", header: "Team", sortable: true },
  { key: "points", header: "Points", sortable: true, align: "right" as const },
  { key: "wins", header: "Wins", sortable: true, align: "right" as const },
];

const meta: Meta<typeof DataTable> = {
  title: "Data Display/DataTable",
  component: DataTable,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    density: {
      control: "select",
      options: ["compact", "default", "spacious"],
    },
    selectionMode: {
      control: "select",
      options: [undefined, "single", "multiple"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof DataTable>;

export const Default: Story = {
  args: {
    columns,
    data: drivers,
    rowKey: (row) => (row as Driver).name,
    label: "Drivers",
  },
};

export const Striped: Story = {
  args: {
    columns,
    data: drivers,
    rowKey: (row) => (row as Driver).name,
    label: "Drivers",
    striped: true,
  },
};

export const MultipleSelection: Story = {
  args: {
    columns,
    data: drivers,
    rowKey: (row) => (row as Driver).name,
    label: "Drivers",
    selectionMode: "multiple",
    defaultSelectedKeys: ["Max Verstappen"],
  },
};

export const SingleSelection: Story = {
  args: {
    columns,
    data: drivers,
    rowKey: (row) => (row as Driver).name,
    label: "Drivers",
    selectionMode: "single",
  },
};

export const Empty: Story = {
  args: {
    columns,
    data: [],
    rowKey: (row) => (row as Driver).name,
    label: "Drivers",
    emptyMessage: "No drivers found for this season.",
  },
};
