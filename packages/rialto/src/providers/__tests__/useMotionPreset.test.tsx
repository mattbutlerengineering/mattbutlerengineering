import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { RialtoProvider } from "../RialtoProvider";
import { useMotionPreset } from "../useMotionPreset";
import { useDeviceContext, type DeviceContext } from "../useDeviceContext";
import { precision, spring, springGentle } from "../../tokens/motion";
import { vibes } from "../vibes";

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

function withProvider({ children }: { children: ReactNode }) {
  return <RialtoProvider>{children}</RialtoProvider>;
}

beforeEach(() => {
  setDevice({});
});

describe("useMotionPreset — the JS motion channel", () => {
  it("returns the static token presets under the default vibe", () => {
    const { result } = renderHook(() => useMotionPreset(), { wrapper: withProvider });
    expect(result.current.precision).toEqual(precision);
    expect(result.current.spring).toEqual(spring);
    expect(result.current.springGentle).toEqual(springGentle);
  });

  /* The load-bearing contract: rialto ships to npm and consumers render these
   * components standalone. useUIEnvironment() throws outside a provider, so
   * this hook must NOT use it — throwing would silently convert every
   * component that adopts the hook into a provider-only component. */
  it("does not throw outside a provider, and falls back to the static tokens", () => {
    expect(() => renderHook(() => useMotionPreset())).not.toThrow();
    const { result } = renderHook(() => useMotionPreset());
    expect(result.current.precision).toEqual(precision);
    expect(result.current.spring).toEqual(spring);
    expect(result.current.springGentle).toEqual(springGentle);
  });

  it("collapses every preset to an instant transition under reduced motion", () => {
    setDevice({ reducedMotion: true });
    const { result } = renderHook(() => useMotionPreset(), { wrapper: withProvider });
    expect(result.current.precision).toEqual({ duration: 0 });
    expect(result.current.spring).toEqual({ duration: 0 });
    expect(result.current.springGentle).toEqual({ duration: 0 });
  });

  it("drops spring physics under reduced motion rather than merely shortening them", () => {
    setDevice({ reducedMotion: true });
    const { result } = renderHook(() => useMotionPreset(), { wrapper: withProvider });
    for (const preset of [result.current.spring, result.current.springGentle]) {
      expect(preset).not.toHaveProperty("type");
      expect(preset).not.toHaveProperty("stiffness");
    }
  });

  it("returns game-tuned configs under the game vibe", () => {
    const { result } = renderHook(() => useMotionPreset(), {
      wrapper: ({ children }) => <RialtoProvider vibe="game">{children}</RialtoProvider>,
    });
    expect(result.current.precision).not.toEqual(precision);
    expect(result.current.spring).not.toEqual(spring);
    expect(result.current.springGentle).not.toEqual(springGentle);
  });

  /* The two channels must speak the same language: a JS-driven transition and
   * a CSS-driven one under the same vibe should not disagree about how fast
   * "standard" is. */
  it("keeps the JS channel in step with the game preset's CSS duration scale", () => {
    const { result } = renderHook(() => useMotionPreset(), {
      wrapper: ({ children }) => <RialtoProvider vibe="game">{children}</RialtoProvider>,
    });
    const cssStandard = Number(String(vibes.game["--rialto-duration-standard"]).replace("s", ""));
    expect(result.current.precision).toMatchObject({ duration: cssStandard });
  });

  it("lets reduced motion win over the game vibe", () => {
    setDevice({ reducedMotion: true });
    const { result } = renderHook(() => useMotionPreset(), {
      wrapper: ({ children }) => <RialtoProvider vibe="game">{children}</RialtoProvider>,
    });
    expect(result.current.precision).toEqual({ duration: 0 });
    expect(result.current.spring).toEqual({ duration: 0 });
  });

  it("honours reduced motion even with no provider in the tree", () => {
    setDevice({ reducedMotion: true });
    const { result } = renderHook(() => useMotionPreset());
    expect(result.current.precision).toEqual({ duration: 0 });
  });
});
