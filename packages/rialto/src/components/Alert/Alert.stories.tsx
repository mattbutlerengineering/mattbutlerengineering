import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect } from '@storybook/test';
import { Alert } from './Alert';
import { Button } from '../Button/Button';

const meta: Meta<typeof Alert> = {
  title: 'Feedback/Alert',
  component: Alert,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['info', 'success', 'warning', 'error'],
    },
    dismissible: {
      control: 'boolean',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Alert>;

export const Default: Story = {
  args: {
    variant: 'info',
    title: 'New information',
    children: 'A new version of Rialto is available. Check out the latest components.',
  },
};

export const Success: Story = {
  args: {
    variant: 'success',
    title: 'Reservation confirmed',
    children: 'Your table for 4 at The Bistro has been booked for Friday at 7:00 PM.',
  },
};

export const Warning: Story = {
  args: {
    variant: 'warning',
    title: 'Unsaved changes',
    children: 'You have unsaved changes in your profile. Do you want to save them before leaving?',
    actions: (
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <Button size="sm">Save Changes</Button>
        <Button size="sm" variant="ghost">Discard</Button>
      </div>
    ),
  },
};

export const Error: Story = {
  args: {
    variant: 'error',
    title: 'Connection failed',
    children: 'We could not connect to the database. Please check your internet connection and try again.',
  },
};

export const Dismissible: Story = {
  args: {
    variant: 'info',
    title: 'Dismissible Alert',
    children: 'You can close this alert by clicking the X button.',
    dismissible: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const alert = canvas.getByRole('alert');
    await expect(alert).toBeInTheDocument();
    const closeButton = canvas.getByRole('button', { name: /close/i });
    await userEvent.click(closeButton);
    // After dismiss, alert should be removed
    await expect(alert).not.toBeInTheDocument();
  },
};
