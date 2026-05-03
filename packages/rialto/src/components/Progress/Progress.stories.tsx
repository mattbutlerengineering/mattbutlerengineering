import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { Progress, Spinner } from './Progress';

const meta: Meta<typeof Progress> = {
  title: 'Feedback/Progress',
  component: Progress,
  tags: ['autodocs'],
  argTypes: {
    value: {
      control: { type: 'range', min: 0, max: 100, step: 1 },
    },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg'],
    },
    showValue: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Progress>;

export const Default: Story = {
  args: {
    value: 65,
    label: 'Uploading files',
    showValue: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const progressbar = canvas.getByRole('progressbar');
    await expect(progressbar).toBeInTheDocument();
    await expect(progressbar).toHaveAttribute('aria-valuenow', '65');
  },
};

export const Empty: Story = {
  args: {
    value: 0,
    label: 'Starting upload',
    showValue: true,
  },
};

export const HalfComplete: Story = {
  args: {
    value: 50,
    label: 'Processing',
    showValue: true,
  },
};

export const Complete: Story = {
  args: {
    value: 100,
    label: 'Upload complete',
    showValue: true,
  },
};

export const Indeterminate: Story = {
  args: {
    label: 'Loading...',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const progressbar = canvas.getByRole('progressbar');
    await expect(progressbar).toBeInTheDocument();
    await expect(progressbar).not.toHaveAttribute('aria-valuenow');
  },
};

export const SmallSize: Story = {
  args: {
    value: 40,
    size: 'sm',
    label: 'Syncing',
  },
};

export const LargeSize: Story = {
  args: {
    value: 75,
    size: 'lg',
    label: 'Importing data',
    showValue: true,
  },
};

export const NoLabel: Story = {
  args: {
    value: 30,
    'aria-label': 'File upload progress',
  },
};

// Spinner stories — Spinner is co-located in Progress.tsx
export const SpinnerDefault: Story = {
  render: () => <Spinner />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const spinner = canvas.getByRole('status');
    await expect(spinner).toBeInTheDocument();
    await expect(spinner).toHaveAttribute('aria-label', 'Loading');
  },
};

export const SpinnerSmall: Story = {
  render: () => <Spinner size="sm" label="Loading items" />,
};

export const SpinnerLarge: Story = {
  render: () => <Spinner size="lg" label="Processing reservation" />,
};
