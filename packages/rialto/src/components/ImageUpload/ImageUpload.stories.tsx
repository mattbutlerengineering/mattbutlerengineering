import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from '@storybook/test';
import { ImageUpload } from './ImageUpload';

const meta: Meta<typeof ImageUpload> = {
  title: 'Specialty/ImageUpload',
  component: ImageUpload,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ImageUpload>;

export const Default: Story = {
  args: {
    onChange: () => {},
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/drop/i)).toBeInTheDocument();
  },
};

export const WithProgress: Story = {
  args: {
    onChange: () => {},
    progress: 45,
  },
};

export const WithExistingImage: Story = {
  args: {
    value: 'https://placehold.co/400x300/f8f6f3/1a1918?text=Preview',
    onChange: () => {},
  },
};
