import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { triggerHapticFeedback, playClickSound } from "./feedback";

describe("triggerHapticFeedback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls navigator.vibrate with pattern when available", () => {
    const vibrateMock = vi.fn();
    Object.defineProperty(navigator, "vibrate", {
      value: vibrateMock,
      writable: true,
      configurable: true,
    });

    triggerHapticFeedback();
    expect(vibrateMock).toHaveBeenCalledWith([15, 30, 15]);
  });

  it("swallows vibration errors", () => {
    Object.defineProperty(navigator, "vibrate", {
      value: () => {
        throw new Error("user gesture required");
      },
      writable: true,
      configurable: true,
    });

    expect(() => triggerHapticFeedback()).not.toThrow();
  });
});

describe("playClickSound", () => {
  let mockOsc: Record<string, any>;
  let mockGain: Record<string, any>;
  let mockCtx: Record<string, any>;
  let origAC: typeof window.AudioContext | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    origAC = window.AudioContext;

    mockOsc = {
      type: "sine",
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    mockGain = {
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    };
    mockCtx = {
      currentTime: 0,
      destination: {},
      createOscillator: vi.fn(() => mockOsc),
      createGain: vi.fn(() => mockGain),
      close: vi.fn(() => Promise.resolve()),
    };

    const MockAC = function (this: any) {
      return mockCtx;
    } as unknown as typeof AudioContext;
    Object.defineProperty(window, "AudioContext", {
      value: MockAC,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, "AudioContext", {
      value: origAC,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("creates oscillator and gain nodes", () => {
    playClickSound();
    expect(mockCtx.createOscillator).toHaveBeenCalledOnce();
    expect(mockCtx.createGain).toHaveBeenCalledOnce();
  });

  it("sets frequency to 80Hz", () => {
    playClickSound();
    expect(mockOsc.frequency.setValueAtTime).toHaveBeenCalledWith(80, 0);
  });

  it("connects osc to gain to destination", () => {
    playClickSound();
    expect(mockOsc.connect).toHaveBeenCalledWith(mockGain);
    expect(mockGain.connect).toHaveBeenCalledWith(mockCtx.destination);
  });

  it("starts and stops oscillator", () => {
    playClickSound();
    expect(mockOsc.start).toHaveBeenCalledOnce();
    expect(mockOsc.stop).toHaveBeenCalledWith(0.1);
  });

  it("closes audio context after 200ms", () => {
    playClickSound();
    expect(mockCtx.close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(mockCtx.close).toHaveBeenCalledOnce();
  });

  it("swallows constructor errors", () => {
    const BadAC = function (this: any) {
      throw new Error("not allowed");
    } as unknown as typeof AudioContext;
    Object.defineProperty(window, "AudioContext", {
      value: BadAC,
      writable: true,
      configurable: true,
    });
    expect(() => playClickSound()).not.toThrow();
  });

  it("handles missing AudioContext gracefully", () => {
    Object.defineProperty(window, "AudioContext", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "webkitAudioContext", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    expect(() => playClickSound()).not.toThrow();
  });
});
