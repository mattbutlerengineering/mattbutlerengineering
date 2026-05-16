import type { Meta, StoryObj } from '@storybook/react-vite';
import { PinInput } from './PinInput';

const meta: Meta<typeof PinInput> = {
  title: 'Forms/PinInput',
  component: PinInput,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    onChange: { action: 'changed' },
    onComplete: { action: 'completed' },
    disabled: { control: 'boolean' },
    error: { control: 'boolean' },
    mask: { control: 'boolean' },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    type: {
      control: 'select',
      options: ['numeric', 'alphanumeric'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof PinInput>;

export const FourDigit: Story = {
  args: {
    label: 'PIN',
    length: 4,
    value: '',
  },
};

export const SixDigit: Story = {
  args: {
    label: 'Verification code',
    length: 6,
    hint: 'Enter the 6-digit code from your authenticator app.',
    value: '',
  },
};

export const WithMask: Story = {
  args: {
    label: 'PIN',
    length: 4,
    mask: true,
    hint: 'Your PIN is hidden for security.',
    value: '',
  },
};

export const Alphanumeric: Story = {
  args: {
    label: 'Access code',
    length: 6,
    type: 'alphanumeric',
    hint: 'Letters and numbers accepted.',
    value: '',
  },
};

export const Prefilled: Story = {
  args: {
    label: 'Verification code',
    length: 6,
    value: '482',
  },
};

export const ErrorState: Story = {
  args: {
    label: 'One-time code',
    length: 6,
    value: '000000',
    error: true,
    hint: 'Code is invalid or expired.',
  },
};

export const Disabled: Story = {
  args: {
    label: 'Recovery code',
    length: 4,
    value: '1234',
    disabled: true,
    disabledReason: 'Recovery codes cannot be edited here.',
  },
};
