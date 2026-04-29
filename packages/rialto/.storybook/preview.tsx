import React from 'react';
import type { Preview } from '@storybook/react';
import { RialtoProvider } from '../src/providers/RialtoProvider';
import '../src/styles-entry.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#f8f6f3' },
        { name: 'dark', value: '#1a1918' },
      ],
    },
  },
  decorators: [
    (Story) => (
      <RialtoProvider>
        <Story />
      </RialtoProvider>
    ),
  ],
};

export default preview;
