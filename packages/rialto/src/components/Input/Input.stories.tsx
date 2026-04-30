import type { Meta, StoryObj } from '@storybook/react-vite-vite';
import { Input } from './Input';

const meta: Meta<typeof Input> = {
  title: 'Form/Input',
  component: Input,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    onChange: { action: 'changed' },
  },
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  args: {
    placeholder: 'Enter text...',
    style: { width: '300px' },
  },
};

export const WithLabel: Story = {
  args: {
    label: 'Email Address',
    placeholder: 'email@example.com',
    type: 'email',
    style: { width: '300px' },
  },
};

export const Error: Story = {
  args: {
    label: 'Username',
    defaultValue: 'invalid user',
    error: true,
    style: { width: '300px' },
  },
};

export const Disabled: Story = {
  args: {
    label: 'Locked Field',
    value: 'Read-only value',
    disabled: true,
    style: { width: '300px' },
  },
};
