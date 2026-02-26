import { createContext, useContext } from 'react';
import type { DeviceContext } from './useDeviceContext';
import type { VibeName } from './vibes';

/* ── Types ───────────────────────────────────── */

export interface UIEnvironment {
  device: DeviceContext;
  vibe: VibeName;
  theme: 'light' | 'dark';
}

/* ── Context + Hook ──────────────────────────── */

export const UIEnvironmentContext = createContext<UIEnvironment | null>(null);

/**
 * Provides access to the current device context, active vibe, and resolved theme.
 * Must be used within a `<RialtoProvider>`.
 */
export function useUIEnvironment(): UIEnvironment {
  const ctx = useContext(UIEnvironmentContext);
  if (!ctx)
    throw new Error('useUIEnvironment must be used within <RialtoProvider>');
  return ctx;
}
