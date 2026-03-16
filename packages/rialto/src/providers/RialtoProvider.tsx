import { useEffect, useMemo, type ReactNode } from "react";
import { useDeviceContext } from "./useDeviceContext";
import { vibes, type VibeName, type VibeOverrides } from "./vibes";
import { UIEnvironmentContext, type UIEnvironment } from "./useUIEnvironment";

/* ── Props ───────────────────────────────────── */

export interface RialtoProviderProps {
  /** Active vibe preset. Defaults to `'default'` (no overrides). */
  vibe?: VibeName;
  /** Additional CSS custom property overrides merged on top of the vibe preset. */
  vibeOverrides?: VibeOverrides;
  /** Theme mode. `'system'` follows the OS color scheme. Defaults to `'system'`. */
  theme?: "light" | "dark" | "system";
  children: ReactNode;
}

/* ── Component ───────────────────────────────── */

/**
 * Root provider for the Rialto design system.
 *
 * Renders a wrapper `<div>` that applies:
 * - `data-theme` attribute for light/dark token cascading
 * - CSS custom property overrides from the active vibe
 *
 * Also provides React context with device signals, active vibe, and resolved theme.
 */
export function RialtoProvider({
  vibe = "default",
  vibeOverrides,
  theme = "system",
  children,
}: RialtoProviderProps) {
  const device = useDeviceContext();

  // Resolve theme: 'system' defers to OS preference
  const resolvedTheme = theme === "system" ? device.colorScheme : theme;

  // Merge vibe preset + custom overrides into inline styles
  const style = useMemo(() => {
    const preset = vibes[vibe];
    if (!vibeOverrides && Object.keys(preset).length === 0) return undefined;
    return { ...preset, ...vibeOverrides } as React.CSSProperties;
  }, [vibe, vibeOverrides]);

  // Sync theme to <html> so body-level styles (global.css) inherit dark tokens
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme]);

  // Context value — memoized to prevent unnecessary re-renders
  const contextValue = useMemo<UIEnvironment>(
    () => ({ device, vibe, theme: resolvedTheme }),
    [device, vibe, resolvedTheme]
  );

  return (
    <UIEnvironmentContext.Provider value={contextValue}>
      <div data-theme={resolvedTheme} style={style}>
        {children}
      </div>
    </UIEnvironmentContext.Provider>
  );
}

RialtoProvider.displayName = "RialtoProvider";
