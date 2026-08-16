import { render } from "@testing-library/react";
import { RialtoProvider } from "../RialtoProvider";
import { vibes } from "../vibes";
import { useDeviceContext, type DeviceContext } from "../useDeviceContext";

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

describe("vibes.game — the game-UI preset", () => {
  it("is a non-empty override map", () => {
    expect(Object.keys(vibes.game).length).toBeGreaterThan(0);
  });

  it("tightens density below the default scale", () => {
    // defaults: sm 12px, md 16px, lg 24px
    expect(vibes.game["--rialto-space-sm"]).toBe("8px");
    expect(vibes.game["--rialto-space-md"]).toBe("12px");
    expect(vibes.game["--rialto-space-lg"]).toBe("18px");
  });

  it("sharpens radii toward instrument corners", () => {
    // defaults: default 6px, soft 10px
    expect(vibes.game["--rialto-radius-default"]).toBe("2px");
    expect(vibes.game["--rialto-radius-soft"]).toBe("4px");
  });

  /* The PRD's criterion is 'a visible state change within 100ms of hover,
   * focus, press, and result' — a budget on interaction FEEDBACK, which rides
   * the fast and standard durations. `slow` covers larger movements (dialog
   * entrances, expansions), not feedback; holding it to the same budget would
   * collapse the scale to a single speed. Encoding the budget in the preset
   * means the catalog inherits it instead of each component being audited. */
  it("keeps the feedback durations under the PRD's 100ms budget", () => {
    for (const token of ["--rialto-duration-fast", "--rialto-duration-standard"]) {
      const value = vibes.game[token];
      expect(value, `${token} must be set by the game preset`).toBeDefined();
      const seconds = Number(String(value).replace("s", ""));
      expect(seconds).toBeLessThan(0.1);
    }
  });

  it("keeps a real duration scale — feedback is faster than large movement", () => {
    const fast = Number(String(vibes.game["--rialto-duration-fast"]).replace("s", ""));
    const standard = Number(String(vibes.game["--rialto-duration-standard"]).replace("s", ""));
    const slow = Number(String(vibes.game["--rialto-duration-slow"]).replace("s", ""));
    expect(fast).toBeLessThan(standard);
    expect(standard).toBeLessThan(slow);
  });

  it("is faster than the shipped defaults it overrides", () => {
    // defaults: fast 0.1s, standard 0.15s, slow 0.2s
    expect(Number(String(vibes.game["--rialto-duration-fast"]).replace("s", ""))).toBeLessThan(0.1);
    expect(Number(String(vibes.game["--rialto-duration-standard"]).replace("s", ""))).toBeLessThan(
      0.15
    );
    expect(Number(String(vibes.game["--rialto-duration-slow"]).replace("s", ""))).toBeLessThan(0.2);
  });

  /* architecture.md, 2026-08-15: the game preset overrides NO colour tokens.
   * Colour stays the theme's job so the vibe composes with light and dark. */
  it("overrides no colour tokens", () => {
    const colourTokens = Object.keys(vibes.game).filter((t) => t.startsWith("--rialto-color"));
    expect(colourTokens).toEqual([]);
  });

  it("leaves the three shipped presets untouched", () => {
    expect(vibes.default).toEqual({});
    expect(vibes.transacting).toEqual({
      "--rialto-space-sm": "10px",
      "--rialto-space-md": "14px",
      "--rialto-radius-default": "4px",
      "--rialto-radius-soft": "8px",
      "--rialto-weight-medium": "600",
    });
    expect(vibes.presenting).toEqual({
      "--rialto-space-md": "20px",
      "--rialto-space-lg": "32px",
      "--rialto-text-sm": "0.9375rem",
      "--rialto-radius-soft": "14px",
      "--rialto-radius-default": "8px",
    });
  });
});

/* ── The precedence assertion moved here from Milestone 1 ──
 * No preset carried a duration token until this one, so 'reduced motion beats
 * a preset's duration' had nothing to observe before now. */
describe("RialtoProvider — reduced motion outranks the game preset", () => {
  function renderProvider(props: Parameters<typeof RialtoProvider>[0]): HTMLElement {
    const { container } = render(<RialtoProvider {...props} />);
    return container.firstElementChild as HTMLElement;
  }

  it("zeroes the game preset's durations when the user prefers reduced motion", () => {
    setDevice({ reducedMotion: true });
    const wrapper = renderProvider({ vibe: "game", children: <span>hud</span> });
    expect(wrapper.style.getPropertyValue("--rialto-duration-fast")).toBe("0s");
    expect(wrapper.style.getPropertyValue("--rialto-duration-standard")).toBe("0s");
    expect(wrapper.style.getPropertyValue("--rialto-duration-slow")).toBe("0s");
  });

  it("keeps the game preset's non-motion tokens under reduced motion", () => {
    setDevice({ reducedMotion: true });
    const wrapper = renderProvider({ vibe: "game", children: <span>hud</span> });
    // density and sharpness survive — only travel is removed
    expect(wrapper.style.getPropertyValue("--rialto-space-md")).toBe("12px");
    expect(wrapper.style.getPropertyValue("--rialto-radius-default")).toBe("2px");
  });

  it("applies the game preset's durations when reduced motion is off", () => {
    setDevice({ reducedMotion: false });
    const wrapper = renderProvider({ vibe: "game", children: <span>hud</span> });
    expect(wrapper.style.getPropertyValue("--rialto-duration-standard")).toBe(
      vibes.game["--rialto-duration-standard"] as string
    );
  });
});
