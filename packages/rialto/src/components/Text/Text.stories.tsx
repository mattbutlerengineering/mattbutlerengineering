import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from '@storybook/test';
import { Text } from './Text';

const meta: Meta<typeof Text> = {
  title: 'Foundation/Text',
  component: Text,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['body', 'caption', 'detail', 'label', 'display'],
    },
    color: {
      control: { type: 'select' },
      options: ['primary', 'secondary', 'tertiary', 'accent', 'success', 'warning', 'error', 'on-accent'],
    },
    align: {
      control: { type: 'radio' },
      options: ['left', 'center', 'right'],
    },
    mono: {
      control: 'boolean',
    },
    truncate: {
      control: 'boolean',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Text>;

export const Default: Story = {
  args: {
    children: 'The quick brown fox jumps over the lazy dog.',
    variant: 'body',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/quick brown fox/)).toBeInTheDocument();
  },
};

export const Variants: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Text variant="display">Display Text</Text>
      <Text variant="body">Body Text (Default)</Text>
      <Text variant="label">Label Text</Text>
      <Text variant="caption">Caption Text</Text>
      <Text variant="detail">Detail Text</Text>
    </div>
  ),
};

export const Monospace: Story = {
  args: {
    mono: true,
    children: 'const x = 42;',
  },
};

export const Colors: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Text color="primary">Primary Text</Text>
      <Text color="secondary">Secondary Text</Text>
      <Text color="tertiary">Tertiary Text</Text>
      <Text color="accent">Accent Text</Text>
      <Text color="success">Success Text</Text>
      <Text color="warning">Warning Text</Text>
      <Text color="error">Error Text</Text>
    </div>
  ),
};
