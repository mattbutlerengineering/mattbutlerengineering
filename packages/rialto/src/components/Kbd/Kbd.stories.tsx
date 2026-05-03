import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from '@storybook/test';
import { Kbd } from './Kbd';

const meta: Meta<typeof Kbd> = {
  title: 'Specialty/Kbd',
  component: Kbd,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Kbd>;

export const Default: Story = {
  args: { children: 'Ctrl' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Ctrl')).toBeInTheDocument();
  },
};

export const KeyCombination: Story = {
  render: () => (
    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
      <Kbd>Ctrl</Kbd> + <Kbd>K</Kbd>
    </span>
  ),
};

export const SingleKeys: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <Kbd>Enter</Kbd>
      <Kbd>Esc</Kbd>
      <Kbd>Tab</Kbd>
      <Kbd>Space</Kbd>
    </div>
  ),
};
