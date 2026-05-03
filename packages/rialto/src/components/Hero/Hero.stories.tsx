import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from '@storybook/test';
import { Hero } from './Hero';
import { Button } from '../Button/Button';

const meta: Meta<typeof Hero> = {
  title: 'Specialty/Hero',
  component: Hero,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Hero>;

export const Default: Story = {
  args: {
    title: 'Build something remarkable',
    subtitle: 'A design system for teams that value precision and warmth.',
    eyebrow: 'Introducing Rialto',
    actions: (
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <Button variant="primary">Get started</Button>
        <Button variant="secondary">Learn more</Button>
      </div>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Build something remarkable')).toBeInTheDocument();
  },
};

export const Simple: Story = {
  args: {
    title: 'Welcome back',
    subtitle: 'Pick up where you left off.',
  },
};

export const WithEyebrow: Story = {
  args: {
    eyebrow: 'New Release',
    title: 'Version 2.0 is here',
    subtitle: 'Faster, more accessible, and beautifully redesigned.',
    actions: <Button variant="primary">Upgrade now</Button>,
  },
};
