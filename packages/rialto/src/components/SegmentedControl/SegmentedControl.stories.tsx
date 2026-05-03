import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SegmentedControl } from './SegmentedControl';

const meta: Meta<typeof SegmentedControl> = {
  title: 'Forms/SegmentedControl',
  component: SegmentedControl,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    onChange: { action: 'changed' },
    size: {
      control: 'select',
      options: ['sm', 'md'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof SegmentedControl>;

export const TwoSegments: Story = {
  args: {
    segments: [
      { id: 'list', label: 'List' },
      { id: 'grid', label: 'Grid' },
    ],
    value: 'list',
  },
};

export const ThreeSegments: Story = {
  args: {
    segments: [
      { id: 'day', label: 'Day' },
      { id: 'week', label: 'Week' },
      { id: 'month', label: 'Month' },
    ],
    value: 'week',
  },
};

export const FiveSegments: Story = {
  args: {
    segments: [
      { id: '1h', label: '1H' },
      { id: '1d', label: '1D' },
      { id: '1w', label: '1W' },
      { id: '1m', label: '1M' },
      { id: '1y', label: '1Y' },
    ],
    value: '1d',
  },
};

export const WithDisabledSegment: Story = {
  args: {
    segments: [
      { id: 'light', label: 'Light' },
      { id: 'dark', label: 'Dark' },
      { id: 'system', label: 'System', disabled: true },
    ],
    value: 'light',
  },
};

export const SmallSize: Story = {
  args: {
    segments: [
      { id: 'asc', label: 'Asc' },
      { id: 'desc', label: 'Desc' },
    ],
    value: 'asc',
    size: 'sm',
  },
};

function ControlledDemo() {
  const [view, setView] = useState('grid');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
      <SegmentedControl
        segments={[
          { id: 'list', label: 'List' },
          { id: 'grid', label: 'Grid' },
          { id: 'map', label: 'Map' },
        ]}
        value={view}
        onChange={setView}
      />
      <span style={{ fontSize: '14px', color: 'var(--rialto-text-secondary)' }}>
        Active view: <strong>{view}</strong>
      </span>
    </div>
  );
}

export const Controlled: Story = {
  render: () => <ControlledDemo />,
};
