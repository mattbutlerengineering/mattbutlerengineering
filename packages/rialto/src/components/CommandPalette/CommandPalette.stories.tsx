import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from '@storybook/test';
import { CommandPalette } from './CommandPalette';

const meta: Meta<typeof CommandPalette> = {
  title: 'Specialty/CommandPalette',
  component: CommandPalette,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof CommandPalette>;

const sampleItems = [
  { id: 'new-file', label: 'New File', group: 'Actions' },
  { id: 'open-file', label: 'Open File', group: 'Actions' },
  { id: 'save', label: 'Save', group: 'Actions' },
  { id: 'settings', label: 'Settings', group: 'Navigation' },
  { id: 'dashboard', label: 'Dashboard', group: 'Navigation' },
];

export const Open: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    items: sampleItems,
    placeholder: 'Type a command...',
    groups: ['Actions', 'Navigation'],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByPlaceholderText('Type a command...')).toBeInTheDocument();
  },
};

export const Closed: Story = {
  args: {
    open: false,
    onOpenChange: () => {},
    items: sampleItems,
  },
};
