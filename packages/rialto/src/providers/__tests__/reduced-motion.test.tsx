import { deriveReducedMotionOverrides, reducedMotionOverrides } from "../reduced-motion";
import type { DeviceContext } from "../useDeviceContext";

const baseDevice: DeviceContext = {
  pointer: "fine",
  viewport: "desktop",
  reducedMotion: false,
  colorScheme: "light",
  saveData: false,
};

/* ── The adapter itself (pure) ───────────────── */

describe("deriveReducedMotionOverrides — the reduced-motion vibe adapter", () => {
  it("collapses every duration token to 0s when reduced motion is requested", () => {
    const overrides = deriveReducedMotionOverrides({ ...baseDevice, reducedMotion: true });
    expect(overrides).toEqual(reducedMotionOverrides);
    expect(overrides["--rialto-duration-fast"]).toBe("0s");
    expect(overrides["--rialto-duration-standard"]).toBe("0s");
    expect(overrides["--rialto-duration-slow"]).toBe("0s");
  });

  it("is a no-op (empty map) when reduced motion is not requested", () => {
    expect(deriveReducedMotionOverrides({ ...baseDevice, reducedMotion: false })).toEqual({});
  });

  it("leaves non-motion tokens alone — state still changes, it just stops travelling", () => {
    const overrides = deriveReducedMotionOverrides({ ...baseDevice, reducedMotion: true });
    for (const token of Object.keys(overrides)) {
      expect(token.startsWith("--rialto-duration-")).toBe(true);
    }
    // easing survives: with zero duration it is inert, but the token is not clobbered
    expect(overrides).not.toHaveProperty("--rialto-ease-precision");
  });

  it("keys on device.reducedMotion alone, ignoring other device signals", () => {
    const noisy: DeviceContext = {
      ...baseDevice,
      viewport: "mobile",
      pointer: "coarse",
      colorScheme: "dark",
      saveData: true,
    };
    expect(deriveReducedMotionOverrides({ ...noisy, reducedMotion: true })).toEqual(
      reducedMotionOverrides
    );
    expect(deriveReducedMotionOverrides({ ...noisy, reducedMotion: false })).toEqual({});
  });

  it("produces overrides through the shared CSS-var (VibeOverrides) interface", () => {
    for (const [token, value] of Object.entries(reducedMotionOverrides)) {
      expect(token.startsWith("--rialto-")).toBe(true);
      expect(typeof value).toBe("string");
    }
  });

  it("is pure — the same device yields an equal map every call, and callers cannot mutate shared state", () => {
    const device = { ...baseDevice, reducedMotion: true };
    const first = deriveReducedMotionOverrides(device);
    const second = deriveReducedMotionOverrides(device);
    expect(first).toEqual(second);
    expect(device.reducedMotion).toBe(true);
  });
});
