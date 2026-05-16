import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useFlipDotSound } from "./use-flip-dot-sound";

// ── AudioContext class-style mock ───────────────────────────────────────────

function makeMockContext() {
  return {
    state: "running" as AudioContextState,
    currentTime: 0,
    destination: {} as AudioDestinationNode,
    createOscillator: vi.fn(() => ({
      type: "square" as OscillatorType,
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    })),
    createGain: vi.fn(() => ({
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    })),
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

type MockContext = ReturnType<typeof makeMockContext>;

let mockCtx: MockContext;

// Build a constructor that returns our shared mockCtx instance.
// Using a regular function (not arrow) so `new` works correctly.
function MockAudioContext(this: unknown) {
  return mockCtx;
}

describe("useFlipDotSound", () => {
  beforeEach(() => {
    mockCtx = makeMockContext();
    vi.stubGlobal("AudioContext", MockAudioContext);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("playClick", () => {
    it("does nothing when enabled=false", () => {
      const { result } = renderHook(() => useFlipDotSound({ enabled: false }));
      act(() => result.current.playClick());
      expect(mockCtx.createOscillator).not.toHaveBeenCalled();
    });

    it("creates an oscillator and gain node when enabled=true", () => {
      const { result } = renderHook(() => useFlipDotSound({ enabled: true, volume: 0.5 }));
      act(() => result.current.playClick());
      expect(mockCtx.createOscillator).toHaveBeenCalledTimes(1);
      expect(mockCtx.createGain).toHaveBeenCalledTimes(1);
    });

    it("reuses the same AudioContext across multiple calls", () => {
      let callCount = 0;
      function CountingAudioContext(this: unknown) {
        callCount++;
        return mockCtx;
      }
      vi.stubGlobal("AudioContext", CountingAudioContext);

      const { result } = renderHook(() => useFlipDotSound({ enabled: true }));
      act(() => {
        result.current.playClick();
        result.current.playClick();
      });
      // AudioContext constructor called only once (context is cached in ref)
      expect(callCount).toBe(1);
    });

    it("resumes a suspended AudioContext", () => {
      mockCtx.state = "suspended";
      const { result } = renderHook(() => useFlipDotSound({ enabled: true }));
      act(() => result.current.playClick());
      expect(mockCtx.resume).toHaveBeenCalled();
    });
  });

  describe("playBatchClick", () => {
    it("does nothing when enabled=false", () => {
      const { result } = renderHook(() => useFlipDotSound({ enabled: false }));
      act(() => result.current.playBatchClick(5));
      expect(mockCtx.createOscillator).not.toHaveBeenCalled();
    });

    it("does nothing when count <= 0", () => {
      const { result } = renderHook(() => useFlipDotSound({ enabled: true }));
      act(() => result.current.playBatchClick(0));
      expect(mockCtx.createOscillator).not.toHaveBeenCalled();
    });

    it("creates up to 4 oscillators for a large count", () => {
      const { result } = renderHook(() => useFlipDotSound({ enabled: true }));
      act(() => result.current.playBatchClick(10));
      // layerCount = Math.min(10, 4) = 4
      expect(mockCtx.createOscillator).toHaveBeenCalledTimes(4);
    });

    it("creates one oscillator for count=1", () => {
      const { result } = renderHook(() => useFlipDotSound({ enabled: true }));
      act(() => result.current.playBatchClick(1));
      expect(mockCtx.createOscillator).toHaveBeenCalledTimes(1);
    });

    it("creates 3 oscillators for count=3", () => {
      const { result } = renderHook(() => useFlipDotSound({ enabled: true }));
      act(() => result.current.playBatchClick(3));
      expect(mockCtx.createOscillator).toHaveBeenCalledTimes(3);
    });
  });

  describe("volume prop reactivity", () => {
    it("applies the current volume on playClick", () => {
      const { result, rerender } = renderHook(
        ({ volume }) => useFlipDotSound({ enabled: true, volume }),
        { initialProps: { volume: 0.2 } }
      );

      rerender({ volume: 0.8 });

      act(() => result.current.playClick());

      // The gain node's setValueAtTime should be called with volume * 0.5 = 0.4
      const gainNode = mockCtx.createGain.mock.results[0]?.value as ReturnType<
        MockContext["createGain"]
      >;
      expect(gainNode.gain.setValueAtTime).toHaveBeenCalledWith(
        expect.closeTo(0.4, 2),
        expect.any(Number)
      );
    });
  });

  describe("cleanup", () => {
    it("closes the AudioContext on unmount after it was used", async () => {
      const { result, unmount } = renderHook(() => useFlipDotSound({ enabled: true }));
      // Trigger context creation
      act(() => result.current.playClick());
      unmount();
      expect(mockCtx.close).toHaveBeenCalled();
    });

    it("does not crash on unmount when AudioContext was never created", () => {
      const { unmount } = renderHook(() => useFlipDotSound({ enabled: false }));
      expect(() => unmount()).not.toThrow();
    });
  });
});
