import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { DataList } from './DataList';

const carSpecs = [
  { label: 'Team', value: 'Red Bull Racing' },
  { label: 'Engine', value: 'Honda RBPT' },
  { label: 'Chassis', value: 'RB19' },
  { label: 'Weight', value: '798 kg' },
  { label: 'Power Unit', value: '1,000+ hp' },
];

const meta: Meta<typeof DataList> = {
  title: 'Data Display/DataList',
  component: DataList,
  tags: ['autodocs'],
  argTypes: {
    orientation: {
      control: { type: 'radio' },
      options: ['horizontal', 'vertical'],
    },
    striped: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof DataList>;

export const Default: Story = {
  args: {
    items: carSpecs,
    orientation: 'horizontal',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const teamLabel = canvas.getByText('Team');
    await expect(teamLabel).toBeInTheDocument();
    const teamValue = canvas.getByText('Red Bull Racing');
    await expect(teamValue).toBeInTheDocument();
  },
};

export const Vertical: Story = {
  args: {
    items: carSpecs,
    orientation: 'vertical',
  },
};

export const Striped: Story = {
  args: {
    items: carSpecs,
    orientation: 'horizontal',
    striped: true,
  },
};

export const StripedVertical: Story = {
  args: {
    items: carSpecs,
    orientation: 'vertical',
    striped: true,
  },
};

export const WithReactNodes: Story = {
  args: {
    items: [
      { label: 'Status', value: <span style={{ color: 'green' }}>Active</span> },
      { label: 'Driver', value: <strong>Max Verstappen</strong> },
      { label: 'Lap Time', value: '1:25.410' },
      { label: 'Sector 1', value: '28.241' },
      { label: 'Sector 2', value: '32.618' },
    ],
    orientation: 'horizontal',
  },
};
