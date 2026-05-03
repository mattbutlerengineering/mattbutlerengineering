import React from 'react';
import type { Preview } from '@storybook/react';
import { RialtoProvider } from '../src/providers/RialtoProvider';
import '../src/styles-entry.css';

const BACKGROUNDS = {
  light: '#f8f6f3',
  dark: '#1a1918',
  system: '#f8f6f3',
};

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'RialtoProvider theme',
      defaultValue: 'light',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'light', icon: 'sun', title: 'Light' },
          { value: 'dark', icon: 'moon', title: 'Dark' },
          { value: 'system', icon: 'mirror', title: 'System' },
        ],
        dynamicTitle: true,
      },
    },
  },
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
        { name: 'light', value: BACKGROUNDS.light },
        { name: 'dark', value: BACKGROUNDS.dark },
      ],
    },
    a11y: {
      config: {
        rules: [
          { id: 'color-contrast', enabled: true },
        ],
      },
    },
  },
  decorators: [
    (Story, context) => {
      const selectedTheme = (context.globals.theme ?? 'light') as 'light' | 'dark' | 'system';

      // Resolve which background name to activate based on the theme toggle.
      // 'system' falls back to 'light' canvas since we can't know the OS preference at build time.
      const backgroundName = selectedTheme === 'dark' ? 'dark' : 'light';

      // Override the active background to stay in sync with the theme toggle.
      context.parameters.backgrounds = {
        ...context.parameters.backgrounds,
        default: backgroundName,
      };

      return (
        <RialtoProvider theme={selectedTheme}>
          <Story />
        </RialtoProvider>
      );
    },
  ],
};

export default preview;
