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
  // Enable automated axe-core a11y checks on every story (not manual-only).
  // color-contrast is disabled here because it is covered by token-contrast.test.ts.
  initialGlobals: {
    a11y: { manual: false },
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
      // Violations will cause test failures when running via vitest storybook runner.
      test: 'error',
      config: {
        rules: [
          // color-contrast is tested separately in token-contrast.test.ts
          { id: 'color-contrast', enabled: false },
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
