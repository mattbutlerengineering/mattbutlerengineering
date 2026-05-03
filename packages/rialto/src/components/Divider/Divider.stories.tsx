import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { Divider } from './Divider';

const meta: Meta<typeof Divider> = {
  title: 'Data Display/Divider',
  component: Divider,
  tags: ['autodocs'],
  argTypes: {
    orientation: {
      control: { type: 'radio' },
      options: ['horizontal', 'vertical'],
    },
    spacing: {
      control: { type: 'radio' },
      options: ['compact', 'default', 'spacious'],
    },
    accent: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Divider>;

export const Default: Story = {
  args: {
    orientation: 'horizontal',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const divider = canvas.getByRole('separator');
    await expect(divider).toBeInTheDocument();
    await expect(divider).toHaveAttribute('aria-orientation', 'horizontal');
  },
};

export const WithLabel: Story = {
  args: {
    label: 'Or',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const label = canvas.getByText('Or');
    await expect(label).toBeInTheDocument();
  },
};

export const Accent: Story = {
  args: {
    accent: true,
  },
};

export const AccentWithLabel: Story = {
  args: {
    label: 'Section Break',
    accent: true,
  },
};

export const Compact: Story = {
  args: {
    spacing: 'compact',
  },
};

export const Spacious: Story = {
  args: {
    spacing: 'spacious',
  },
};

export const Vertical: Story = {
  render: () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', height: '60px' }}>
      <span>Left Content</span>
      <Divider orientation="vertical" />
      <span>Right Content</span>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const divider = canvas.getByRole('separator');
    await expect(divider).toHaveAttribute('aria-orientation', 'vertical');
  },
};

export const InContext: Story = {
  render: () => (
    <div style={{ width: '300px' }}>
      <p style={{ margin: '0 0 0.5rem' }}>Qualifying Results</p>
      <Divider />
      <p style={{ margin: '0.5rem 0' }}>P1: Max Verstappen — 1:25.410</p>
      <Divider label="Gap" />
      <p style={{ margin: '0.5rem 0' }}>P2: Charles Leclerc — 1:25.732</p>
      <Divider accent />
      <p style={{ margin: '0.5rem 0 0' }}>P3: Lewis Hamilton — 1:25.987</p>
    </div>
  ),
};
