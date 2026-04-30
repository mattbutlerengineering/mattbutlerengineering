import type { Meta, StoryObj } from '@storybook/react-vite';
import { Avatar, AvatarGroup } from './Avatar';

const meta: Meta<typeof Avatar> = {
  title: 'Display/Avatar',
  component: Avatar,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: { type: 'radio' },
      options: ['sm', 'md', 'lg', 'xl'],
    },
    status: {
      control: { type: 'select' },
      options: ['online', 'offline', 'busy', 'away'],
    },
    transition: {
      control: { type: 'radio' },
      options: ['fade', 'splitflap'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Avatar>;

export const Default: Story = {
  args: {
    name: 'Matt Butler',
    size: 'md',
  },
};

export const WithImage: Story = {
  args: {
    src: 'https://i.pravatar.cc/150?u=mbe',
    name: 'User Name',
    size: 'lg',
  },
};

export const WithStatus: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '1rem' }}>
      <Avatar name="Online User" status="online" />
      <Avatar name="Busy User" status="busy" />
      <Avatar name="Away User" status="away" />
      <Avatar name="Offline User" status="offline" />
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
      <Avatar name="Small" size="sm" />
      <Avatar name="Medium" size="md" />
      <Avatar name="Large" size="lg" />
      <Avatar name="Extra Large" size="xl" />
    </div>
  ),
};

export const Group: StoryObj<typeof AvatarGroup> = {
  render: () => (
    <AvatarGroup
      avatars={[
        { name: 'Alice', src: 'https://i.pravatar.cc/150?u=alice' },
        { name: 'Bob', src: 'https://i.pravatar.cc/150?u=bob' },
        { name: 'Charlie', src: 'https://i.pravatar.cc/150?u=charlie' },
        { name: 'David', src: 'https://i.pravatar.cc/150?u=david' },
        { name: 'Eve', src: 'https://i.pravatar.cc/150?u=eve' },
      ]}
      max={4}
    />
  ),
};
