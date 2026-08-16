/**
 * Rialto Reduced-Motion Vibe Adapter
 *
 * A THIRD adapter behind the shared vibe interface ({@link VibeOverrides}, a
 * map of `--rialto-*` CSS custom properties), alongside the static
 * {@link vibes} preset lookup and the device-driven {@link deriveReducedDataOverrides}.
 * Like reduced-data, this one is *derived at runtime* from the device
 * environment — here from `device.reducedMotion`, the
 * `prefers-reduced-motion: reduce` signal detected by {@link useDeviceContext}.
 *
 * Three adapters, one interface: all three produce a `VibeOverrides` map that
 * `RialtoProvider` applies through the same inline CSS-var-override path and
 * the same CSS cascade — no bespoke second mechanism.
 *
 * When reduced motion is requested we collapse the duration scale to zero and
 * touch nothing else. This is deliberate: motion is one channel of feedback,
 * not the whole language. Transitions land in a single frame instead of
 * travelling, while the tokens that carry state through contrast, weight, and
 * border are left untouched — so an action still visibly answers, it just
 * stops moving. Easing tokens are also left alone; at zero duration they are
 * inert, and clobbering them would lose information for no benefit.
 */

import type { DeviceContext } from "./useDeviceContext";
import type { VibeOverrides } from "./vibes";

/**
 * Zeroed duration overrides applied when the user prefers reduced motion.
 * Each key shadows the corresponding default from `tokens/shadows.css`
 * (fast 0.1s → 0s, standard 0.15s → 0s, slow 0.2s → 0s).
 */
export const reducedMotionOverrides: VibeOverrides = {
  "--rialto-duration-fast": "0s",
  "--rialto-duration-standard": "0s",
  "--rialto-duration-slow": "0s",
};

/**
 * Derives reduced-motion vibe overrides from the current device context.
 *
 * Returns {@link reducedMotionOverrides} when `device.reducedMotion` is
 * `true`, otherwise an empty map — a no-op, so users without the preference
 * compose exactly the style they composed before this adapter existed.
 */
export function deriveReducedMotionOverrides(device: DeviceContext): VibeOverrides {
  return device.reducedMotion ? reducedMotionOverrides : {};
}
