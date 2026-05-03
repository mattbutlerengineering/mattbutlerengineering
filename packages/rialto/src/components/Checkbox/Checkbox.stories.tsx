import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from '@storybook/test';
import { Checkbox } from './Checkbox';

const meta: Meta<typeof Checkbox> = {
  title: 'Forms/Checkbox',
  component: Checkbox,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    onCheckedChange: { action: 'checkedChange' },
    checked: { control: 'boolean' },
    disabled: { control: 'boolean' },
    indeterminate: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Unchecked: Story = {
  args: {
    label: 'Accept terms and conditions',
    checked: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const checkbox = canvas.getByRole('checkbox');
    await expect(checkbox).toBeInTheDocument();
    await expect(checkbox).not.toBeChecked();
  },
};

export const Checked: Story = {
  args: {
    label: 'Subscribe to newsletter',
    checked: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const checkbox = canvas.getByRole('checkbox');
    await expect(checkbox).toBeChecked();
  },
};

export const Indeterminate: Story = {
  args: {
    label: 'Select all items',
    indeterminate: true,
    description: '3 of 7 items selected',
  },
};

export const WithDescription: Story = {
  args: {
    label: 'Marketing emails',
    checked: false,
    description: 'Receive product updates and promotional offers.',
  },
};

export const Disabled: Story = {
  args: {
    label: 'Admin access',
    checked: false,
    disabled: true,
    disabledReason: 'Contact your administrator to change this setting.',
  },
};

export const DisabledChecked: Story = {
  args: {
    label: 'Required agreement',
    checked: true,
    disabled: true,
  },
};
