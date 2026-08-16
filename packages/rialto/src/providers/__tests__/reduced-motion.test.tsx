import { render } from "@testing-library/react";
import { RialtoProvider, type RialtoProviderProps } from "../RialtoProvider";
import { deriveReducedMotionOverrides, reducedMotionOverrides } from "../reduced-motion";
import { useDeviceContext, type DeviceContext } from "../useDeviceContext";

/* ── Mock the device hook so tests drive `device.reducedMotion` directly ──
 * The real matchMedia → reducedMotion path is covered in useDeviceContext.test.ts;
 * here we isolate the composition wiring inside RialtoProvider. */
vi.mock("../useDeviceContext", () => ({
  useDeviceContext: vi.fn(),
}));

const baseDevice: DeviceContext = {
  pointer: "fine",
  viewport: "desktop",
  reducedMotion: false,
  colorScheme: "light",
  saveData: false,
};

function setDevice(overrides: Partial<DeviceContext>): void {
  vi.mocked(useDeviceContext).mockReturnValue({ ...baseDevice, ...overrides });
}

beforeEach(() => {
  setDevice({});
});

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

/* ── Wired through RialtoProvider (the second consumer) ── */

describe("RialtoProvider — reduced-motion composition", () => {
  function renderProvider(
    props: Partial<Pick<RialtoProviderProps, "vibe" | "vibeOverrides" | "theme">>
  ): HTMLElement {
    const { container } = render(
      <RialtoProvider {...props}>
        <span>content</span>
      </RialtoProvider>
    );
    return container.firstElementChild as HTMLElement;
  }

  it("applies zeroed durations when device.reducedMotion is true", () => {
    setDevice({ reducedMotion: true });
    const wrapper = renderProvider({});
    expect(wrapper.style.getPropertyValue("--rialto-duration-fast")).toBe("0s");
    expect(wrapper.style.getPropertyValue("--rialto-duration-standard")).toBe("0s");
    expect(wrapper.style.getPropertyValue("--rialto-duration-slow")).toBe("0s");
  });

  it("applies no overrides when reduced motion is off and no vibe is set", () => {
    setDevice({ reducedMotion: false });
    const wrapper = renderProvider({});
    expect(wrapper.getAttribute("style")).toBeNull();
  });

  it("leaves a vibe preset's non-duration tokens intact", () => {
    setDevice({ reducedMotion: true });
    const wrapper = renderProvider({ vibe: "presenting" });
    expect(wrapper.style.getPropertyValue("--rialto-duration-standard")).toBe("0s");
    // presenting's own tokens are untouched by the motion adapter
    expect(wrapper.style.getPropertyValue("--rialto-space-md")).toBe("20px");
    expect(wrapper.style.getPropertyValue("--rialto-radius-soft")).toBe("14px");
  });

  it("composes alongside the reduced-data adapter when both signals are on", () => {
    setDevice({ reducedMotion: true, saveData: true });
    const wrapper = renderProvider({});
    expect(wrapper.style.getPropertyValue("--rialto-duration-fast")).toBe("0s");
    expect(wrapper.style.getPropertyValue("--rialto-space-md")).toBe("12px");
  });

  it("lets explicit vibeOverrides win over reduced-motion (caller has the final say)", () => {
    setDevice({ reducedMotion: true });
    const wrapper = renderProvider({
      vibeOverrides: { "--rialto-duration-standard": "0.4s" },
    });
    expect(wrapper.style.getPropertyValue("--rialto-duration-standard")).toBe("0.4s");
  });
});
