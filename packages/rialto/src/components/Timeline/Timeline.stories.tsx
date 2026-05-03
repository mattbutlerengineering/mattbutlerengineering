import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { Timeline } from './Timeline';

const raceEvents = [
  {
    title: 'Lights Out',
    description: 'Race start at Circuit de Monaco',
    timestamp: '14:00',
    status: 'completed' as const,
  },
  {
    title: 'Safety Car Deployed',
    description: 'Incident at Rascasse corner',
    timestamp: '14:18',
    status: 'completed' as const,
  },
  {
    title: 'Pit Window Opens',
    description: 'Optimal pit stop window begins on lap 24',
    timestamp: '14:35',
    status: 'active' as const,
  },
  {
    title: 'Final Stint',
    description: 'Push to the finish line',
    timestamp: '15:00',
    status: 'upcoming' as const,
  },
  {
    title: 'Chequered Flag',
    description: 'Race end after 78 laps',
    timestamp: '15:42',
    status: 'upcoming' as const,
  },
];

const meta: Meta<typeof Timeline> = {
  title: 'Data Display/Timeline',
  component: Timeline,
  tags: ['autodocs'],
  argTypes: {
    compact: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Timeline>;

export const Default: Story = {
  args: {
    events: raceEvents,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const timeline = canvas.getByRole('list', { name: 'Timeline' });
    await expect(timeline).toBeInTheDocument();
    const items = canvas.getAllByRole('listitem');
    await expect(items).toHaveLength(raceEvents.length);
  },
};

export const Compact: Story = {
  args: {
    events: raceEvents,
    compact: true,
  },
};

export const WithError: Story = {
  args: {
    events: [
      {
        title: 'Qualifying Session',
        timestamp: '10:00',
        status: 'completed',
      },
      {
        title: 'Grid Penalty Applied',
        description: 'Engine component change — 5-place grid penalty',
        timestamp: '11:30',
        status: 'error',
      },
      {
        title: 'Race Start',
        description: 'Starting from P8 after penalty',
        timestamp: '14:00',
        status: 'upcoming',
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const errorItem = canvas.getByText('Grid Penalty Applied');
    await expect(errorItem).toBeInTheDocument();
  },
};

export const AllCompleted: Story = {
  args: {
    events: [
      { title: 'Practice 1', timestamp: 'Fri 14:00', status: 'completed' },
      { title: 'Practice 2', timestamp: 'Fri 17:00', status: 'completed' },
      { title: 'Practice 3', timestamp: 'Sat 12:00', status: 'completed' },
      { title: 'Qualifying', timestamp: 'Sat 15:00', status: 'completed' },
      { title: 'Race', timestamp: 'Sun 14:00', status: 'completed' },
    ],
  },
};

export const MinimalEvents: Story = {
  args: {
    events: [
      { title: 'Check In', status: 'completed' },
      { title: 'Room Assigned', status: 'active' },
      { title: 'Check Out', status: 'upcoming' },
    ],
  },
};
