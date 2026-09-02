import { useEffect, useMemo, type ReactNode } from "react";
import { useDeviceContext } from "./useDeviceContext";
import { deriveReducedDataOverrides } from "./reduced-data";
import { deriveReducedMotionOverrides } from "./reduced-motion";
import { vibes, type VibeName, type VibeOverrides } from "./vibes";
import { UIEnvironmentContext, type UIEnvironment } from "./useUIEnvironment";

/**
 * `<meta name="theme-color">` content, mirroring the `--rialto-surface`
 * ground token (packages/rialto/src/tokens/colors.css) literally — meta
 * tags can't read CSS custom properties, so these two must be kept in sync
 * by hand with the token source of truth.
 */
const THEME_COLOR: Record<"light" | "dark", string> = {
  light: "#f8f6f3",
  dark: "#1e1c1a",
};

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
 * - CSS custom property overrides composed from three adapters behind one
 *   interface: the active `vibe` preset, a reduced-data adapter driven by
 *   `device.saveData` (tightens spacing when the user prefers reduced data),
 *   and a reduced-motion adapter driven by `device.reducedMotion` (collapses
 *   the duration scale when the user prefers reduced motion)
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

  // Compose the CSS-var overrides from three adapters behind one interface,
  // low → high precedence (later wins):
  //   1. vibe preset              — the static design-language adapter (`vibes`)
  //   2. reduced-data overrides   — device-driven (`device.saveData`)
  //   3. reduced-motion overrides — device-driven (`device.reducedMotion`);
  //      ranks above the preset so a vibe can never re-impose motion on a user
  //      who asked for less of it
  //   4. explicit vibeOverrides   — the caller's fine-tuning, always final say
  const style = useMemo(() => {
    const preset = vibes[vibe];
    const reducedData = deriveReducedDataOverrides(device);
    const reducedMotion = deriveReducedMotionOverrides(device);
    const merged = { ...preset, ...reducedData, ...reducedMotion, ...vibeOverrides };
    if (Object.keys(merged).length === 0) return undefined;
    return merged as React.CSSProperties;
  }, [vibe, vibeOverrides, device]);

  // Sync theme to <html> so body-level styles (global.css) inherit dark tokens
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme]);

  // Sync the mobile browser chrome color to the resolved theme. The two
  // static, media-keyed <meta name="theme-color"> tags in each app's
  // index.html only track the OS prefers-color-scheme query, so an explicit
  // in-page toggle (independent of OS preference) leaves them stale. Mutate
  // both tags' content directly rather than adding a third un-mediaed tag —
  // this sidesteps browser theme-color precedence ambiguity entirely, and
  // the static pair still paints the correct frame color before hydration
  // or with JS disabled.
  useEffect(() => {
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    metas.forEach((meta) => meta.setAttribute("content", THEME_COLOR[resolvedTheme]));
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
