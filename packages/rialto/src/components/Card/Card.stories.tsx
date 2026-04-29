import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card } from './Card';
import { Text } from '../Text/Text';
import { Stack } from '../Stack/Stack';

const meta: Meta<typeof Card> = {
  title: 'Foundation/Card',
  component: Card,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: (args) => (
    <Card {...args} style={{ width: '300px' }}>
      <Stack gap="md">
        <Text variant="display" as="h3">Card Title</Text>
        <Text variant="body" color="secondary">
          This is a sample card component with some placeholder text to demonstrate its layout and styling.
        </Text>
      </Stack>
    </Card>
  ),
};

export const Elevated: Story = {
  args: {
    variant: 'elevated',
  },
  render: (args) => (
    <Card {...args} style={{ width: '300px' }}>
      <Stack gap="md">
        <Text variant="display" as="h3">Elevated Card</Text>
        <Text variant="body" color="secondary">
          Elevated cards have a stronger shadow to stand out from the surface.
        </Text>
      </Stack>
    </Card>
  ),
};

export const Tilt: Story = {
  args: {
    tilt: true,
  },
  render: (args) => (
    <Card {...args} style={{ width: '300px' }}>
      <Stack gap="md">
        <Text variant="display" as="h3">Interactive Tilt</Text>
        <Text variant="body" color="secondary">
          Hover over this card to see the 3D tilt effect.
        </Text>
      </Stack>
    </Card>
  ),
};
