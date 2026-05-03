import type { Meta, StoryObj } from '@storybook/react-vite';
import { DropdownMenu } from './DropdownMenu';
import { Button } from '../Button/Button';
import { within, userEvent, expect } from '@storybook/test';

const meta: Meta<typeof DropdownMenu> = {
  title: 'Overlay/DropdownMenu',
  component: DropdownMenu,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof DropdownMenu>;

export const Default: Story = {
  render: () => (
    <DropdownMenu
      trigger={<Button variant="ghost">Actions</Button>}
      items={[
        { id: 'edit', label: 'Edit', shortcut: 'Ctrl+E', onSelect: () => {} },
        { id: 'duplicate', label: 'Duplicate', shortcut: 'Ctrl+D', onSelect: () => {} },
        { type: 'divider' },
        { id: 'delete', label: 'Delete', destructive: true, shortcut: 'Del', onSelect: () => {} },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: 'Actions' });
    await userEvent.click(button);
    await expect(canvas.getByText('Edit')).toBeInTheDocument();
  },
};

export const WithGroups: Story = {
  render: () => (
    <DropdownMenu
      trigger={<Button size="sm">Menu</Button>}
      items={[
        { type: 'label', label: 'File' },
        { id: 'new', label: 'New File', onSelect: () => {} },
        { id: 'open', label: 'Open...', onSelect: () => {} },
        { type: 'divider' },
        { type: 'label', label: 'Edit' },
        { id: 'undo', label: 'Undo', shortcut: 'Ctrl+Z', onSelect: () => {} },
        { id: 'redo', label: 'Redo', shortcut: 'Ctrl+Y', onSelect: () => {} },
      ]}
    />
  ),
};

export const WithIcons: Story = {
  render: () => (
    <DropdownMenu
      trigger={<Button variant="ghost">Options</Button>}
      items={[
        { id: 'copy', label: 'Copy', icon: <span>📋</span>, shortcut: 'Ctrl+C', onSelect: () => {} },
        { id: 'paste', label: 'Paste', icon: <span>📎</span>, shortcut: 'Ctrl+V', onSelect: () => {} },
        { type: 'divider' },
        { id: 'cut', label: 'Cut', icon: <span>✂️</span>, shortcut: 'Ctrl+X', onSelect: () => {} },
      ]}
    />
  ),
};
