import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { Skeleton, SkeletonGroup } from './Skeleton';

const meta: Meta<typeof Skeleton> = {
  title: 'Feedback/Skeleton',
  component: Skeleton,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['text', 'heading', 'circle', 'rect', 'card'],
    },
    lines: { control: { type: 'number', min: 1, max: 10 } },
    width: { control: 'text' },
    height: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof Skeleton>;

export const Default: Story = {
  args: {
    variant: 'rect',
    width: 200,
    height: 20,
  },
  play: async ({ canvasElement }) => {
    // Skeleton uses aria-hidden so we query the DOM directly
    const skeleton = canvasElement.querySelector('[aria-hidden="true"]');
    await expect(skeleton).not.toBeNull();
  },
};

export const TextLines: Story = {
  args: {
    variant: 'text',
    lines: 3,
    width: '100%',
  },
};

export const HeadingLines: Story = {
  args: {
    variant: 'heading',
    lines: 2,
    width: '80%',
  },
};

export const Circle: Story = {
  args: {
    variant: 'circle',
    width: 48,
  },
};

export const Card: Story = {
  args: {
    variant: 'card',
    width: 300,
    height: 180,
  },
};

export const ProfileCard: Story = {
  render: () => (
    <SkeletonGroup>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', width: 280 }}>
        <Skeleton variant="circle" width={40} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <Skeleton variant="heading" width="60%" />
          <Skeleton variant="text" lines={2} width="100%" />
        </div>
      </div>
    </SkeletonGroup>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const group = canvas.getByRole('status');
    await expect(group).toBeInTheDocument();
    await expect(group).toHaveAttribute('aria-busy', 'true');
  },
};

export const ArticleLayout: Story = {
  render: () => (
    <SkeletonGroup>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: 400 }}>
        <Skeleton variant="card" width="100%" height={200} />
        <Skeleton variant="heading" width="70%" />
        <Skeleton variant="text" lines={4} width="100%" />
      </div>
    </SkeletonGroup>
  ),
};

export const TableRows: Story = {
  render: () => (
    <SkeletonGroup>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: 500 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <Skeleton variant="circle" width={32} />
            <Skeleton variant="text" width="40%" />
            <Skeleton variant="text" width="30%" />
            <Skeleton variant="rect" width={60} height={22} />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  ),
};
