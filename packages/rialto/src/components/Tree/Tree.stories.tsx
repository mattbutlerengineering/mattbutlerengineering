import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, expect, userEvent, within } from 'storybook/test';
import { Tree } from './Tree';
import type { TreeNode } from './Tree';

const f1CarTree: TreeNode[] = [
  {
    id: 'powertrain',
    label: 'Powertrain',
    children: [
      { id: 'ice', label: 'ICE' },
      { id: 'mgu-k', label: 'MGU-K' },
      { id: 'mgu-h', label: 'MGU-H' },
      { id: 'energy-store', label: 'Energy Store' },
    ],
  },
  {
    id: 'chassis',
    label: 'Chassis',
    children: [
      { id: 'floor', label: 'Floor' },
      { id: 'diffuser', label: 'Diffuser' },
      {
        id: 'wings',
        label: 'Wings',
        children: [
          { id: 'front-wing', label: 'Front Wing' },
          { id: 'rear-wing', label: 'Rear Wing' },
        ],
      },
    ],
  },
  {
    id: 'suspension',
    label: 'Suspension',
    children: [
      { id: 'push-rod', label: 'Push Rod (front)' },
      { id: 'pull-rod', label: 'Pull Rod (rear)' },
    ],
  },
  {
    id: 'electronics',
    label: 'Electronics',
    children: [
      { id: 'ecu', label: 'ECU', disabled: true },
      { id: 'sensors', label: 'Sensors' },
    ],
  },
];

const meta: Meta<typeof Tree> = {
  title: 'Data Display/Tree',
  component: Tree,
  tags: ['autodocs'],
  args: {
    onSelect: fn(),
    onExpandedChange: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof Tree>;

export const Default: Story = {
  args: {
    data: f1CarTree,
    defaultExpanded: ['powertrain'],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tree = canvas.getByRole('tree');
    await expect(tree).toBeInTheDocument();
    const powertrainItem = canvas.getByRole('treeitem', { name: /Powertrain/i });
    await expect(powertrainItem).toBeInTheDocument();
    await expect(powertrainItem).toHaveAttribute('aria-expanded', 'true');
  },
};

export const AllCollapsed: Story = {
  args: {
    data: f1CarTree,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const powertrainItem = canvas.getByRole('treeitem', { name: /Powertrain/i });
    await expect(powertrainItem).toHaveAttribute('aria-expanded', 'false');
  },
};

export const ExpandCollapse: Story = {
  args: {
    data: f1CarTree,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const chassisItem = canvas.getByRole('treeitem', { name: /Chassis/i });
    await expect(chassisItem).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(chassisItem);
    await expect(chassisItem).toHaveAttribute('aria-expanded', 'true');
    const floorItem = canvas.getByRole('treeitem', { name: /Floor/i });
    await expect(floorItem).toBeInTheDocument();
    await userEvent.click(chassisItem);
    await expect(chassisItem).toHaveAttribute('aria-expanded', 'false');
  },
};

export const WithSelection: Story = {
  args: {
    data: f1CarTree,
    defaultExpanded: ['powertrain', 'chassis', 'wings'],
    selectionMode: 'single',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const iceItem = canvas.getByRole('treeitem', { name: /^ICE$/i });
    await userEvent.click(iceItem);
    await expect(iceItem).toHaveAttribute('aria-selected', 'true');
  },
};

export const NoSelection: Story = {
  args: {
    data: f1CarTree,
    defaultExpanded: ['powertrain'],
    selectionMode: 'none',
  },
};

export const DeepNested: Story = {
  args: {
    data: f1CarTree,
    defaultExpanded: ['chassis', 'wings'],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const frontWingItem = canvas.getByRole('treeitem', { name: /Front Wing/i });
    await expect(frontWingItem).toBeInTheDocument();
  },
};
