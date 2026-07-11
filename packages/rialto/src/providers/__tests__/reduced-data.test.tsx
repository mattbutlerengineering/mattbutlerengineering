import { render } from "@testing-library/react";
import { RialtoProvider, type RialtoProviderProps } from "../RialtoProvider";
import { deriveReducedDataOverrides, reducedDataOverrides } from "../reduced-data";
import { useDeviceContext, type DeviceContext } from "../useDeviceContext";

/* ── Mock the device hook so tests drive `device.saveData` directly ──
 * The real matchMedia → saveData path is covered in useDeviceContext.test.ts;
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

describe("deriveReducedDataOverrides — the reduced-data vibe adapter", () => {
  it("emits the compact override map when Save-Data is on", () => {
    const overrides = deriveReducedDataOverrides({ ...baseDevice, saveData: true });
    expect(overrides).toEqual(reducedDataOverrides);
    // tightens the spacing scale below its defaults (16px → 12px, 24px → 16px)
    expect(overrides["--rialto-space-md"]).toBe("12px");
    expect(overrides["--rialto-space-lg"]).toBe("16px");
  });

  it("is a no-op (empty map) when Save-Data is off", () => {
    expect(deriveReducedDataOverrides({ ...baseDevice, saveData: false })).toEqual({});
  });

  it("keys on device.saveData alone, ignoring other device signals", () => {
    const noisy: DeviceContext = {
      ...baseDevice,
      viewport: "mobile",
      pointer: "coarse",
      reducedMotion: true,
      colorScheme: "dark",
    };
    expect(deriveReducedDataOverrides({ ...noisy, saveData: true })).toEqual(reducedDataOverrides);
    expect(deriveReducedDataOverrides({ ...noisy, saveData: false })).toEqual({});
  });

  it("produces overrides through the shared CSS-var (VibeOverrides) interface", () => {
    for (const [token, value] of Object.entries(reducedDataOverrides)) {
      expect(token.startsWith("--rialto-")).toBe(true);
      expect(typeof value).toBe("string");
    }
  });
});

/* ── Wired through RialtoProvider (the second consumer) ── */

describe("RialtoProvider — reduced-data composition", () => {
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

  it("applies reduced-data overrides when device.saveData is true", () => {
    setDevice({ saveData: true });
    const wrapper = renderProvider({});
    expect(wrapper.style.getPropertyValue("--rialto-space-md")).toBe("12px");
    expect(wrapper.style.getPropertyValue("--rialto-space-lg")).toBe("16px");
  });

  it("applies no overrides when device.saveData is false and no vibe is set", () => {
    setDevice({ saveData: false });
    const wrapper = renderProvider({});
    expect(wrapper.getAttribute("style")).toBeNull();
  });

  it("composes reduced-data on top of the vibe preset (device tightens the preset)", () => {
    setDevice({ saveData: true });
    // presenting loosens --rialto-space-md to 20px; reduced-data tightens it to 12px
    const wrapper = renderProvider({ vibe: "presenting" });
    expect(wrapper.style.getPropertyValue("--rialto-space-md")).toBe("12px");
    // a presenting token the reduced-data adapter does not touch still applies
    expect(wrapper.style.getPropertyValue("--rialto-radius-soft")).toBe("14px");
  });

  it("lets explicit vibeOverrides win over reduced-data (caller has the final say)", () => {
    setDevice({ saveData: true });
    const wrapper = renderProvider({ vibeOverrides: { "--rialto-space-md": "40px" } });
    expect(wrapper.style.getPropertyValue("--rialto-space-md")).toBe("40px");
  });
});
