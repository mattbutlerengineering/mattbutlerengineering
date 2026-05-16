import type { Meta, StoryObj } from '@storybook/react-vite';
import { ToastProvider } from './Toast';
import { useToast } from './ToastContext';
import { Button } from '../Button/Button';
import { Stack } from '../Stack/Stack';
import { within, userEvent, expect } from '@storybook/test';

const meta: Meta<typeof ToastProvider> = {
  title: 'Overlay/Toast',
  component: ToastProvider,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ToastProvider>
        <Story />
      </ToastProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ToastProvider>;

function SuccessToast() {
  const { toast } = useToast();
  return (
    <Button onClick={() => toast({ title: 'Success!', description: 'Your changes have been saved.', variant: 'success' })}>
      Show Success Toast
    </Button>
  );
}

export const Success: Story = {
  render: () => <SuccessToast />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: 'Show Success Toast' });
    await userEvent.click(button);
    await expect(canvas.getByText('Success!')).toBeInTheDocument();
  },
};

function ErrorToast() {
  const { toast } = useToast();
  return (
    <Button variant="ghost" onClick={() => toast({ title: 'Error!', description: 'Failed to save changes.', variant: 'error' })}>
      Show Error Toast
    </Button>
  );
}

export const Error: Story = {
  render: () => <ErrorToast />,
};

function AccentToast() {
  const { toast } = useToast();
  return (
    <Button onClick={() => toast({ title: 'Notice', description: 'This action cannot be undone.', variant: 'accent' })}>
      Show Accent Toast
    </Button>
  );
}

export const Accent: Story = {
  render: () => <AccentToast />,
};

function InfoToast() {
  const { toast } = useToast();
  return (
    <Stack direction="row" gap="sm">
      <Button onClick={() => toast({ title: 'Notification', description: 'You have a new message.' })}>
        Show Info Toast
      </Button>
    </Stack>
  );
}

export const Info: Story = {
  render: () => <InfoToast />,
};

function PersistentToast() {
  const { toast } = useToast();
  return (
    <Button onClick={() => toast({ title: 'Manual dismiss', description: 'This toast stays until dismissed.', duration: 0 })}>
      Show Persistent Toast
    </Button>
  );
}

export const Persistent: Story = {
  render: () => <PersistentToast />,
};
