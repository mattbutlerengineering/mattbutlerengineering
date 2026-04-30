import type { Meta, StoryObj } from '@storybook/react-vite';
import { Stack } from './Stack';
import { Card } from '../Card/Card';
import { Text } from '../Text/Text';

const meta: Meta<typeof Stack> = {
  title: 'Layout/Stack',
  component: Stack,
  tags: ['autodocs'],
  argTypes: {
    direction: {
      control: { type: 'radio' },
      options: ['column', 'row'],
    },
    gap: {
      control: { type: 'select' },
      options: ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'],
    },
    align: {
      control: { type: 'select' },
      options: ['start', 'center', 'end', 'stretch', 'baseline'],
    },
    justify: {
      control: { type: 'select' },
      options: ['start', 'center', 'end', 'between'],
    },
    wrap: {
      control: 'boolean',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Stack>;

const Box = ({ children }: { children: React.ReactNode }) => (
  <div style={{ 
    padding: '1rem', 
    background: 'var(--rialto-color-accent-subtle)', 
    border: '1px solid var(--rialto-color-accent)',
    borderRadius: '4px',
    minWidth: '50px',
    textAlign: 'center'
  }}>
    {children}
  </div>
);

export const Vertical: Story = {
  args: {
    direction: 'column',
    gap: 'md',
    children: (
      <>
        <Box>Item 1</Box>
        <Box>Item 2</Box>
        <Box>Item 3</Box>
      </>
    ),
  },
};

export const Horizontal: Story = {
  args: {
    direction: 'row',
    gap: 'md',
    children: (
      <>
        <Box>Item 1</Box>
        <Box>Item 2</Box>
        <Box>Item 3</Box>
      </>
    ),
  },
};

export const ComplexLayout: Story = {
  render: () => (
    <Stack gap="xl">
      <Stack gap="sm">
        <Text variant="label">Section Header</Text>
        <div style={{ height: '2px', background: 'var(--rialto-color-border)' }} />
      </Stack>
      <Stack direction="row" gap="lg" align="center" justify="between">
        <Card style={{ padding: '1rem', flex: 1 }}>
          <Text>Content A</Text>
        </Card>
        <Card style={{ padding: '1rem', flex: 1 }}>
          <Text>Content B</Text>
        </Card>
      </Stack>
    </Stack>
  ),
};
