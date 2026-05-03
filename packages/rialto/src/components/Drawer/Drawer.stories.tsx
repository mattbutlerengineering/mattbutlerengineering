import type { Meta, StoryObj } from '@storybook/react-vite';
import { Drawer } from './Drawer';
import { Button } from '../Button/Button';
import { Input } from '../Input/Input';
import { Stack } from '../Stack/Stack';
import { useState } from 'react';
import { within, userEvent, expect } from '@storybook/test';

const meta: Meta<typeof Drawer> = {
  title: 'Overlay/Drawer',
  component: Drawer,
  tags: ['autodocs'],
  argTypes: {
    side: {
      control: { type: 'select' },
      options: ['left', 'right', 'bottom'],
    },
    size: {
      control: { type: 'select' },
      options: ['default', 'wide', 'full'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Drawer>;

const Template = (args) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open Drawer</Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Settings"
        side={args.side || 'right'}
        size={args.size || 'default'}
        footer={
          <Stack direction="row" gap="sm" justify="end">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => setOpen(false)}>Save</Button>
          </Stack>
        }
      >
        <Stack gap="md">
          <Input label="Display Name" defaultValue="Matt" />
          <Input label="Email" type="email" defaultValue="matt@example.com" />
        </Stack>
      </Drawer>
    </>
  );
};

export const Right: Story = {
  render: () => <Template side="right" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: 'Open Drawer' });
    await userEvent.click(button);
    await expect(canvas.getByRole('dialog')).toBeInTheDocument();
  },
};

export const Left: Story = {
  render: () => <Template side="left" />,
};

export const Bottom: Story = {
  render: () => <Template side="bottom" />,
};

export const Wide: Story = {
  render: () => <Template size="wide" />,
};
