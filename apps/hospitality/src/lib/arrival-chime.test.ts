import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ARRIVAL_CHIME_MUTED_KEY,
  isArrivalChimeMuted,
  playArrivalChime,
  resetArrivalChimeAudioForTests,
  setArrivalChimeMuted,
  subscribeArrivalChimeMuted,
} from "./arrival-chime.js";

interface FakeOsc {
  type: string;
  frequency: { setValueAtTime: ReturnType<typeof vi.fn> };
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

function installFakeAudioContext(opts: { resume?: () => Promise<void>; state?: string } = {}) {
  const oscillators: FakeOsc[] = [];
  const ctx = {
    state: opts.state ?? "running",
    currentTime: 0,
    destination: {},
    resume: vi.fn(opts.resume ?? (() => Promise.resolve())),
    createOscillator: vi.fn(() => {
      const osc: FakeOsc = {
        type: "sine",
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(osc);
      return osc;
    }),
    createGain: vi.fn(() => ({
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    })),
  };
  const Ctor = vi.fn(function () {
    return ctx;
  });
  vi.stubGlobal("AudioContext", Ctor);
  return { ctx, Ctor, oscillators };
}

describe("arrival chime mute setting", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to unmuted", () => {
    expect(isArrivalChimeMuted()).toBe(false);
  });

  it("persists per device in localStorage and notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeArrivalChimeMuted(listener);
    setArrivalChimeMuted(true);
    expect(localStorage.getItem(ARRIVAL_CHIME_MUTED_KEY)).toBe("true");
    expect(isArrivalChimeMuted()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    setArrivalChimeMuted(false);
    expect(isArrivalChimeMuted()).toBe(false);
    unsubscribe();
    setArrivalChimeMuted(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("treats unreadable storage as unmuted", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(isArrivalChimeMuted()).toBe(false);
    vi.restoreAllMocks();
  });
});

describe("playArrivalChime", () => {
  beforeEach(() => resetArrivalChimeAudioForTests());
  afterEach(() => vi.unstubAllGlobals());

  it("plays a two-note tone through Web Audio", () => {
    const { oscillators } = installFakeAudioContext();
    playArrivalChime();
    expect(oscillators).toHaveLength(2);
    for (const osc of oscillators) {
      expect(osc.start).toHaveBeenCalled();
      expect(osc.stop).toHaveBeenCalled();
    }
  });

  it("resumes a suspended context (autoplay policy)", () => {
    const { ctx } = installFakeAudioContext({ state: "suspended" });
    playArrivalChime();
    expect(ctx.resume).toHaveBeenCalled();
  });

  it("swallows a rejected resume() without an unhandled rejection", async () => {
    installFakeAudioContext({
      state: "suspended",
      resume: () => Promise.reject(new Error("NotAllowedError")),
    });
    expect(() => playArrivalChime()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });

  it("does not throw when AudioContext is unavailable", () => {
    vi.stubGlobal("AudioContext", undefined);
    expect(() => playArrivalChime()).not.toThrow();
  });

  it("does not throw when the context constructor throws", () => {
    vi.stubGlobal(
      "AudioContext",
      vi.fn(function () {
        throw new Error("boom");
      })
    );
    expect(() => playArrivalChime()).not.toThrow();
  });
});
