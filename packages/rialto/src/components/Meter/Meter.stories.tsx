import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { Meter } from './Meter';

const meta: Meta<typeof Meter> = {
  title: 'Feedback/Meter',
  component: Meter,
  tags: ['autodocs'],
  argTypes: {
    value: {
      control: { type: 'range', min: 0, max: 100, step: 1 },
    },
    variant: {
      control: { type: 'select' },
      options: ['default', 'accent', 'success', 'error'],
    },
    size: {
      control: { type: 'radio' },
      options: ['sm', 'md'],
    },
    showValue: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Meter>;

export const Default: Story = {
  args: {
    value: 72,
    label: 'Fuel Load',
    showValue: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const meter = canvas.getByRole('meter');
    await expect(meter).toBeInTheDocument();
    await expect(meter).toHaveAttribute('aria-valuenow', '72');
  },
};

export const Empty: Story = {
  args: {
    value: 0,
    label: 'Battery',
    showValue: true,
  },
};

export const HalfFull: Story = {
  args: {
    value: 50,
    label: 'Storage used',
    showValue: true,
  },
};

export const Full: Story = {
  args: {
    value: 100,
    label: 'Capacity',
    showValue: true,
  },
};

export const VariantAccent: Story = {
  args: {
    value: 68,
    label: 'Revenue target',
    variant: 'accent',
    showValue: true,
  },
};

export const VariantSuccess: Story = {
  args: {
    value: 85,
    label: 'Occupancy rate',
    variant: 'success',
    showValue: true,
  },
};

export const VariantError: Story = {
  args: {
    value: 92,
    label: 'Disk usage',
    variant: 'error',
    showValue: true,
  },
};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '300px' }}>
      <Meter value={60} label="Default" variant="default" showValue />
      <Meter value={60} label="Accent" variant="accent" showValue />
      <Meter value={60} label="Success" variant="success" showValue />
      <Meter value={60} label="Error" variant="error" showValue />
    </div>
  ),
};

export const SmallSize: Story = {
  args: {
    value: 45,
    label: 'Network load',
    size: 'sm',
    showValue: true,
  },
};

export const CustomRange: Story = {
  args: {
    value: 37,
    min: 0,
    max: 50,
    label: 'Temperature (°C)',
    variant: 'error',
    showValue: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const meter = canvas.getByRole('meter');
    await expect(meter).toHaveAttribute('aria-valuenow', '37');
    await expect(meter).toHaveAttribute('aria-valuemin', '0');
    await expect(meter).toHaveAttribute('aria-valuemax', '50');
  },
};
