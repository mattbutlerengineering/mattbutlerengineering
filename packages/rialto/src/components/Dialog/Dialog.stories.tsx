import type { Meta, StoryObj } from '@storybook/react-vite';
import { Dialog } from './Dialog';
import { Button } from '../Button/Button';
import { Input } from '../Input/Input';
import { Stack } from '../Stack/Stack';
import { useState } from 'react';
import { within, userEvent, expect } from '@storybook/test';

const meta: Meta<typeof Dialog> = {
  title: 'Overlay/Dialog',
  component: Dialog,
  tags: ['autodocs'],
  argTypes: {
    open: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Dialog>;

const Template = (args) => {
  const [open, setOpen] = useState(args.open || false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open Dialog</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Edit Profile"
        footer={
          <Stack direction="row" gap="sm" justify="end">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => setOpen(false)}>Save</Button>
          </Stack>
        }
      >
        <Stack gap="md">
          <Input label="Name" defaultValue="Matt Butler" />
          <Input label="Email" type="email" defaultValue="matt@example.com" />
        </Stack>
      </Dialog>
    </>
  );
};

export const Default: Story = {
  render: () => <Template open={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: 'Open Dialog' });
    await userEvent.click(button);
    await expect(canvas.getByRole('dialog')).toBeInTheDocument();
    await expect(canvas.getByText('Edit Profile')).toBeInTheDocument();
  },
};

const ScrollableDialog = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>View Details</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Terms of Service">
        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {Array.from({ length: 20 }, (_, i) => (
            <p key={i} style={{ marginBottom: '1rem' }}>
              This is paragraph {i + 1} of the terms of service...
            </p>
          ))}
        </div>
      </Dialog>
    </>
  );
};

export const WithScrollableContent: Story = {
  render: () => <ScrollableDialog />,
};

const SmallDialog = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">Small Dialog</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Small">
        <p>Small dialog content.</p>
      </Dialog>
    </>
  );
};

export const Small: Story = {
  render: () => <SmallDialog />,
};
