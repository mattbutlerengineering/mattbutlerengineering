import type { Meta, StoryObj } from '@storybook/react-vite';
import { NumberInput } from './NumberInput';

const meta: Meta<typeof NumberInput> = {
  title: 'Forms/NumberInput',
  component: NumberInput,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    onChange: { action: 'changed' },
    disabled: { control: 'boolean' },
    error: { control: 'boolean' },
    size: {
      control: 'select',
      options: ['small', 'default', 'large'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof NumberInput>;

export const Default: Story = {
  args: {
    label: 'Quantity',
    value: 1,
  },
};

export const WithMinMax: Story = {
  args: {
    label: 'Age',
    value: 18,
    min: 0,
    max: 120,
    hint: 'Must be between 0 and 120',
  },
};

export const WithStep: Story = {
  args: {
    label: 'Price',
    value: 9.99,
    step: 0.5,
    min: 0,
    hint: 'Increments by $0.50',
  },
};

export const Disabled: Story = {
  args: {
    label: 'Max Seats',
    value: 10,
    disabled: true,
    disabledReason: 'Seat count is fixed for your current plan.',
  },
};

export const ErrorState: Story = {
  args: {
    label: 'Timeout (seconds)',
    value: -1,
    min: 1,
    error: true,
    hint: 'Value must be at least 1.',
  },
};

export const SmallSize: Story = {
  args: {
    label: 'Count',
    value: 3,
    size: 'small',
  },
};

export const LargeSize: Story = {
  args: {
    label: 'Budget',
    value: 500,
    size: 'large',
  },
};
