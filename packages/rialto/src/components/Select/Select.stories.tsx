import type { Meta, StoryObj } from '@storybook/react-vite';
import { Select } from './Select';

const COUNTRY_OPTIONS = [
  { value: 'us', label: 'United States' },
  { value: 'ca', label: 'Canada' },
  { value: 'gb', label: 'United Kingdom' },
  { value: 'au', label: 'Australia' },
  { value: 'de', label: 'Germany' },
];

const meta: Meta<typeof Select> = {
  title: 'Forms/Select',
  component: Select,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    onChange: { action: 'changed' },
    disabled: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Select>;

export const Default: Story = {
  args: {
    label: 'Country',
    placeholder: 'Select a country…',
    options: COUNTRY_OPTIONS,
  },
};

export const WithOptions: Story = {
  args: {
    label: 'Country',
    options: COUNTRY_OPTIONS,
    value: 'ca',
  },
};

export const WithDisabledOption: Story = {
  args: {
    label: 'Plan',
    options: [
      { value: 'free', label: 'Free' },
      { value: 'pro', label: 'Pro' },
      { value: 'enterprise', label: 'Enterprise', disabled: true },
    ],
    value: 'free',
  },
};

export const Disabled: Story = {
  args: {
    label: 'Region',
    options: COUNTRY_OPTIONS,
    value: 'us',
    disabled: true,
    disabledReason: 'Region cannot be changed after account creation.',
  },
};

export const ErrorState: Story = {
  args: {
    label: 'Category',
    options: COUNTRY_OPTIONS,
    placeholder: 'Select a category…',
  },
};
