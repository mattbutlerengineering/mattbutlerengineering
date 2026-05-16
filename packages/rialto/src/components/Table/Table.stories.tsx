import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, expect, userEvent, within } from 'storybook/test';
import { Table } from './Table';

interface Driver {
  name: string;
  team: string;
  points: number;
  wins: number;
}

const drivers: Driver[] = [
  { name: 'Max Verstappen', team: 'Red Bull Racing', points: 575, wins: 19 },
  { name: 'Sergio Perez', team: 'Red Bull Racing', points: 285, wins: 2 },
  { name: 'Lewis Hamilton', team: 'Mercedes', points: 234, wins: 0 },
  { name: 'Carlos Sainz', team: 'Ferrari', points: 200, wins: 1 },
  { name: 'Fernando Alonso', team: 'Aston Martin', points: 206, wins: 0 },
];

const columns = [
  { key: 'name', header: 'Driver', sortable: true },
  { key: 'team', header: 'Team', sortable: true },
  { key: 'points', header: 'Points', sortable: true, align: 'right' as const },
  { key: 'wins', header: 'Wins', sortable: true, align: 'right' as const },
];

const meta: Meta<typeof Table> = {
  title: 'Data Display/Table',
  component: Table,
  tags: ['autodocs'],
  args: {
    onRowClick: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof Table>;

export const Default: Story = {
  args: {
    columns,
    data: drivers,
    rowKey: (row) => (row as Driver).name,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const pointsHeader = canvas.getByRole('columnheader', { name: /Points/i });
    await expect(pointsHeader).toBeInTheDocument();
    await userEvent.click(pointsHeader);
    const firstCell = canvas.getAllByRole('cell')[2];
    await expect(firstCell).toBeInTheDocument();
  },
};

export const Striped: Story = {
  args: {
    columns,
    data: drivers,
    rowKey: (row) => (row as Driver).name,
    striped: true,
  },
};

export const Compact: Story = {
  args: {
    columns,
    data: drivers,
    rowKey: (row) => (row as Driver).name,
    density: 'compact',
  },
};

export const Spacious: Story = {
  args: {
    columns,
    data: drivers,
    rowKey: (row) => (row as Driver).name,
    density: 'spacious',
  },
};

export const Empty: Story = {
  args: {
    columns,
    data: [],
    rowKey: (row) => (row as Driver).name,
    emptyMessage: 'No drivers found for this season.',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const emptyCell = canvas.getByText('No drivers found for this season.');
    await expect(emptyCell).toBeInTheDocument();
  },
};

export const SortedByPoints: Story = {
  args: {
    columns,
    data: drivers,
    rowKey: (row) => (row as Driver).name,
    striped: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const pointsHeader = canvas.getByRole('columnheader', { name: /Points/i });
    await userEvent.click(pointsHeader);
    await expect(pointsHeader).toHaveAttribute('aria-sort', 'ascending');
    await userEvent.click(pointsHeader);
    await expect(pointsHeader).toHaveAttribute('aria-sort', 'descending');
  },
};
