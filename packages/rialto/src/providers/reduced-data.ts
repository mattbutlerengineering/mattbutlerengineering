/**
 * Rialto Reduced-Data Vibe Adapter
 *
 * A SECOND adapter behind the shared vibe interface ({@link VibeOverrides},
 * a map of `--rialto-*` CSS custom properties). Where {@link vibes} is a
 * *static* adapter — a `VibeName` looked up in a build-time constant map —
 * this adapter is *derived at runtime* from the device environment,
 * specifically `device.saveData` (the `prefers-reduced-data: reduce` signal
 * detected by {@link useDeviceContext}).
 *
 * Two adapters, one interface: the preset lookup and this device-driven
 * derivation both produce a `VibeOverrides` map that `RialtoProvider` applies
 * through the same inline CSS-var-override path and the same CSS cascade — no
 * bespoke second mechanism.
 *
 * When Save-Data is on we tighten the spacing scale by roughly one step,
 * trading whitespace for density so more content fits with less paint and
 * scrolling. Only spacing tokens shift; radii, type, and colors are untouched.
 */

import type { DeviceContext } from "./useDeviceContext";
import type { VibeOverrides } from "./vibes";

/**
 * Compact spacing overrides applied when the user has Save-Data enabled.
 * Each value tightens the corresponding default from `tokens/spacing.css`
 * (sm 12→8, md 16→12, lg 24→16, xl 32→24, 2xl 48→32, 3xl 64→48).
 */
export const reducedDataOverrides: VibeOverrides = {
  "--rialto-space-sm": "8px",
  "--rialto-space-md": "12px",
  "--rialto-space-lg": "16px",
  "--rialto-space-xl": "24px",
  "--rialto-space-2xl": "32px",
  "--rialto-space-3xl": "48px",
};

/**
 * Derives reduced-data vibe overrides from the current device context.
 *
 * Returns {@link reducedDataOverrides} when `device.saveData` is `true`,
 * otherwise an empty map — a no-op so callers who are not in reduced-data
 * mode are entirely unaffected.
 */
export function deriveReducedDataOverrides(device: DeviceContext): VibeOverrides {
  return device.saveData ? reducedDataOverrides : {};
}
