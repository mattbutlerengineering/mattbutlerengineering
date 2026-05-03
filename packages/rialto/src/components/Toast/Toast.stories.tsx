import type { Meta, StoryObj } from '@storybook/react-vite';
import { Toast, useToast, ToastProvider } from './Toast';
import { Button } from '../Button/Button';
import { Stack } from '../Stack/Stack';
import { within, userEvent, expect } from '@storybook/test';

const meta: Meta<typeof Toast> = {
  title: 'Overlay/Toast',
  component: Toast,
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
type Story = StoryObj<typeof Toast>;

function SuccessToast() {
  const { addToast } = useToast();
  return (
    <Button onClick={() => addToast({ title: 'Success!', description: 'Your changes have been saved.', variant: 'success' })}>
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
  const { addToast } = useToast();
  return (
    <Button variant="ghost" onClick={() => addToast({ title: 'Error!', description: 'Failed to save changes.', variant: 'error' })}>
      Show Error Toast
    </Button>
  );
}

export const Error: Story = {
  render: () => <ErrorToast />,
};

function WarningToast() {
  const { addToast } = useToast();
  return (
    <Button onClick={() => addToast({ title: 'Warning', description: 'This action cannot be undone.', variant: 'warning' })}>
      Show Warning Toast
    </Button>
  );
}

export const Warning: Story = {
  render: () => <WarningToast />,
};

function InfoToast() {
  const { addToast } = useToast();
  return (
    <Stack direction="row" gap="sm">
      <Button onClick={() => addToast({ title: 'Notification', description: 'You have a new message.' })}>
        Show Info Toast
      </Button>
    </Stack>
  );
}

export const Info: Story = {
  render: () => <InfoToast />,
};

function ActionToast() {
  const { addToast } = useToast();
  return (
    <Button onClick={() => addToast({
      title: 'Undo changes?',
      description: 'This action can be reverted.',
      action: <Button size="sm" variant="ghost">Undo</Button>,
    })}>
      Show Toast with Action
    </Button>
  );
}

export const WithAction: Story = {
  render: () => <ActionToast />,
};
