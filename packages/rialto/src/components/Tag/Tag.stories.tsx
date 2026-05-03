import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, expect, userEvent, within } from 'storybook/test';
import { Tag, AnimatedTag, TagGroup } from './Tag';

const meta: Meta<typeof Tag> = {
  title: 'Data Display/Tag',
  component: Tag,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['default', 'accent', 'success', 'error'],
    },
    dismissible: { control: 'boolean' },
    selected: { control: 'boolean' },
  },
  args: {
    onClick: fn(),
    onDismiss: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof Tag>;

export const Default: Story = {
  args: {
    children: 'Telemetry',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tag = canvas.getByText('Telemetry');
    await expect(tag).toBeInTheDocument();
  },
};

export const Variants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
      <Tag variant="default">Default</Tag>
      <Tag variant="accent">Accent</Tag>
      <Tag variant="success">Confirmed</Tag>
      <Tag variant="error">Cancelled</Tag>
    </div>
  ),
};

function InteractiveTagGroup() {
  const [selected, setSelected] = useState('all');
  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      {(['all', 'dry', 'inter', 'wet'] as const).map((filter) => (
        <Tag
          key={filter}
          onClick={() => setSelected(filter)}
          selected={selected === filter}
        >
          {filter.charAt(0).toUpperCase() + filter.slice(1)}
        </Tag>
      ))}
    </div>
  );
}

export const Interactive: Story = {
  render: () => <InteractiveTagGroup />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dryTag = canvas.getByRole('button', { name: /Dry/i });
    await expect(dryTag).toBeInTheDocument();
    await userEvent.click(dryTag);
  },
};

export const Dismissible: Story = {
  args: {
    children: 'Removable Tag',
    dismissible: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dismissBtn = canvas.getByRole('button', { name: /Remove Removable Tag/i });
    await expect(dismissBtn).toBeInTheDocument();
  },
};

export const Selected: Story = {
  args: {
    children: 'Active Filter',
    selected: true,
    onClick: fn(),
  },
};

function AnimatedTagGroupDemo() {
  const allTags = ['DRS', 'Safety Car', 'Pit Window', 'Weather', 'Tyre Deg'];
  const [activeTags, setActiveTags] = useState(allTags);

  const remove = (tag: string) => {
    setActiveTags((prev) => prev.filter((t) => t !== tag));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '300px' }}>
      <TagGroup>
        {activeTags.map((tag) => (
          <AnimatedTag key={tag} id={tag} dismissible onDismiss={() => remove(tag)}>
            {tag}
          </AnimatedTag>
        ))}
      </TagGroup>
      {activeTags.length === 0 && (
        <span style={{ fontSize: '0.875rem', opacity: 0.6 }}>All tags removed</span>
      )}
    </div>
  );
}

export const AnimatedGroup: Story = {
  render: () => <AnimatedTagGroupDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dismissBtn = canvas.getByRole('button', { name: /Remove DRS/i });
    await expect(dismissBtn).toBeInTheDocument();
    await userEvent.click(dismissBtn);
    await expect(canvas.queryByText('DRS')).not.toBeInTheDocument();
  },
};
