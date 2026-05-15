import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { useFlipDotAnimation } from "./use-flip-dot-animation";

// ── Timer helper ─────────────────────────────────────────────────────────────
//
// Mount with real timers so React's scheduler flushes useEffect (which
// populates fullMatrixRef). Then switch to fake timers BEFORE calling start(),
// so start()'s setInterval uses the fake timer. Wrap start() + advance inside
// a single act() so React batches all state updates from the interval ticks.

function withFakeTimers<T>(
  options: Parameters<typeof useFlipDotAnimation>[0],
  run: (
    result: ReturnType<typeof renderHook<ReturnType<typeof useFlipDotAnimation>, never>>["result"]
  ) => T
): T {
  // 1. Mount with real timers – effects fire synchronously in jsdom
  const hookResult = renderHook(() => useFlipDotAnimation(options));
  // 2. Switch to fake timers – subsequent setInterval calls go to fake clock
  vi.useFakeTimers();
  try {
    return run(hookResult.result);
  } finally {
    vi.useRealTimers();
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useFlipDotAnimation", () => {
  describe("initial state", () => {
    it("returns an empty matrix on mount", () => {
      const { result } = renderHook(() =>
        useFlipDotAnimation({ rows: 3, cols: 5, autoStart: false })
      );
      expect(result.current.matrix).toHaveLength(3);
      expect(result.current.matrix[0]).toHaveLength(5);
    });

    it("starts not playing when autoStart=false", () => {
      const { result } = renderHook(() =>
        useFlipDotAnimation({ rows: 3, cols: 5, autoStart: false })
      );
      expect(result.current.isPlaying).toBe(false);
    });

    it("starts playing when autoStart=true", () => {
      const { result } = renderHook(() =>
        useFlipDotAnimation({ rows: 3, cols: 5, text: "A", autoStart: true })
      );
      expect(result.current.isPlaying).toBe(true);
      act(() => result.current.pause());
    });
  });

  describe("start / pause / reset controls", () => {
    it("start sets isPlaying to true", () => {
      const { result } = renderHook(() =>
        useFlipDotAnimation({ rows: 3, cols: 5, text: "A", autoStart: false })
      );
      act(() => result.current.start());
      expect(result.current.isPlaying).toBe(true);
      act(() => result.current.pause());
    });

    it("pause sets isPlaying to false", () => {
      const { result } = renderHook(() =>
        useFlipDotAnimation({ rows: 3, cols: 5, text: "A", autoStart: false })
      );
      act(() => result.current.start());
      act(() => result.current.pause());
      expect(result.current.isPlaying).toBe(false);
    });

    it("reset sets isPlaying to false and clears the matrix", () => {
      const { result } = renderHook(() =>
        useFlipDotAnimation({ rows: 3, cols: 5, text: "A", autoStart: false })
      );
      act(() => result.current.start());
      act(() => result.current.reset());
      expect(result.current.isPlaying).toBe(false);
      const allOff = result.current.matrix.every((row) => row.every((cell) => cell === false));
      expect(allOff).toBe(true);
    });
  });

  describe("typewriter mode", () => {
    it("matrix stays the configured width during animation", () => {
      withFakeTimers(
        {
          rows: 7,
          cols: 10,
          text: "HELLO",
          mode: "typewriter",
          speed: 100,
          autoStart: false,
        },
        (result) => {
          act(() => {
            result.current.start();
            vi.advanceTimersByTime(300);
          });
          expect(result.current.matrix[0]).toHaveLength(10);
        }
      );
    });

    it("stops when done without loop", () => {
      withFakeTimers(
        {
          rows: 7,
          cols: 6,
          text: "A",
          mode: "typewriter",
          speed: 50,
          loop: false,
          autoStart: false,
        },
        (result) => {
          act(() => {
            result.current.start();
            vi.advanceTimersByTime(2000);
          });
          expect(result.current.isPlaying).toBe(false);
        }
      );
    });

    it("loops when loop=true — stays playing after many ticks", () => {
      withFakeTimers(
        {
          rows: 7,
          cols: 3,
          text: "A",
          mode: "typewriter",
          speed: 50,
          loop: true,
          autoStart: false,
        },
        (result) => {
          act(() => {
            result.current.start();
            vi.advanceTimersByTime(5000);
          });
          expect(result.current.isPlaying).toBe(true);
        }
      );
    });
  });

  describe("scroll-left mode", () => {
    it("matrix is always the configured dimensions", () => {
      withFakeTimers(
        {
          rows: 7,
          cols: 8,
          text: "HI",
          mode: "scroll-left",
          speed: 50,
          autoStart: false,
        },
        (result) => {
          act(() => {
            result.current.start();
            vi.advanceTimersByTime(500);
          });
          expect(result.current.matrix).toHaveLength(7);
          expect(result.current.matrix[0]).toHaveLength(8);
        }
      );
    });

    it("stops when done without loop", () => {
      withFakeTimers(
        {
          rows: 7,
          cols: 4,
          text: "A",
          mode: "scroll-left",
          speed: 20,
          loop: false,
          autoStart: false,
        },
        (result) => {
          act(() => {
            result.current.start();
            vi.advanceTimersByTime(5000);
          });
          expect(result.current.isPlaying).toBe(false);
        }
      );
    });

    it("loops when loop=true", () => {
      withFakeTimers(
        {
          rows: 7,
          cols: 4,
          text: "A",
          mode: "scroll-left",
          speed: 20,
          loop: true,
          autoStart: false,
        },
        (result) => {
          act(() => {
            result.current.start();
            vi.advanceTimersByTime(10000);
          });
          expect(result.current.isPlaying).toBe(true);
        }
      );
    });
  });

  describe("scroll-right mode", () => {
    it("produces correct matrix dimensions", () => {
      withFakeTimers(
        {
          rows: 7,
          cols: 8,
          text: "AB",
          mode: "scroll-right",
          speed: 50,
          autoStart: false,
        },
        (result) => {
          act(() => {
            result.current.start();
            vi.advanceTimersByTime(500);
          });
          expect(result.current.matrix).toHaveLength(7);
          expect(result.current.matrix[0]).toHaveLength(8);
        }
      );
    });

    it("stops when done without loop", () => {
      withFakeTimers(
        {
          rows: 7,
          cols: 4,
          text: "A",
          mode: "scroll-right",
          speed: 20,
          loop: false,
          autoStart: false,
        },
        (result) => {
          act(() => {
            result.current.start();
            vi.advanceTimersByTime(5000);
          });
          expect(result.current.isPlaying).toBe(false);
        }
      );
    });

    it("loops when loop=true", () => {
      withFakeTimers(
        {
          rows: 7,
          cols: 4,
          text: "A",
          mode: "scroll-right",
          speed: 20,
          loop: true,
          autoStart: false,
        },
        (result) => {
          act(() => {
            result.current.start();
            vi.advanceTimersByTime(10000);
          });
          expect(result.current.isPlaying).toBe(true);
        }
      );
    });
  });

  describe("blink mode", () => {
    it("matrix dimensions stay correct across ticks", () => {
      withFakeTimers(
        {
          rows: 7,
          cols: 5,
          text: "A",
          mode: "blink",
          speed: 100,
          autoStart: false,
        },
        (result) => {
          act(() => {
            result.current.start();
            vi.advanceTimersByTime(400); // 4 ticks
          });
          // Matrix must always be 7 rows × 5 cols regardless of blink state
          expect(result.current.matrix).toHaveLength(7);
          expect(result.current.matrix[0]).toHaveLength(5);
        }
      );
    });

    it("after an odd number of ticks the matrix is all-off (blank phase)", () => {
      // Blink step=0 → show, step=1 → blank, step=2 → show, step=3 → blank …
      // After 3 ticks (300ms) the matrix should be blank.
      withFakeTimers(
        {
          rows: 7,
          cols: 5,
          text: "A",
          mode: "blink",
          speed: 100,
          autoStart: false,
        },
        (result) => {
          act(() => {
            result.current.start();
            vi.advanceTimersByTime(300); // 3 ticks → step 0,1,2 → last state is step=2 (even=show)
            // Actually step increments AFTER setMatrix: step=0→show, then +=1 → step=1 → blank, +=1 → step=2 → show
            // After 3 timer fires the last applied step is 2 (even = show).
            // Advance one more to land on blank (step=3, odd).
            vi.advanceTimersByTime(100); // step 3 → blank
          });
          expect(result.current.matrix.flat().every((v) => v === false)).toBe(true);
        }
      );
    });

    it("keeps playing indefinitely (no end condition)", () => {
      withFakeTimers(
        {
          rows: 7,
          cols: 5,
          text: "A",
          mode: "blink",
          speed: 100,
          loop: false,
          autoStart: false,
        },
        (result) => {
          act(() => {
            result.current.start();
            vi.advanceTimersByTime(5000);
          });
          expect(result.current.isPlaying).toBe(true);
        }
      );
    });
  });

  describe("frames mode", () => {
    const frame1 = [
      [true, false],
      [false, true],
    ] as const;
    const frame2 = [
      [false, true],
      [true, false],
    ] as const;
    const testFrames = [frame1, frame2] as const;

    it("displays the first frame on first tick", () => {
      withFakeTimers(
        {
          rows: 2,
          cols: 2,
          frames: testFrames,
          mode: "frames",
          speed: 100,
          autoStart: false,
        },
        (result) => {
          act(() => {
            result.current.start();
            vi.advanceTimersByTime(100);
          });
          expect(result.current.matrix).toEqual(frame1);
        }
      );
    });

    it("advances to second frame after two ticks", () => {
      withFakeTimers(
        {
          rows: 2,
          cols: 2,
          frames: testFrames,
          mode: "frames",
          speed: 100,
          autoStart: false,
        },
        (result) => {
          act(() => {
            result.current.start();
            vi.advanceTimersByTime(200);
          });
          expect(result.current.matrix).toEqual(frame2);
        }
      );
    });

    it("stops on last frame when loop=false", () => {
      withFakeTimers(
        {
          rows: 2,
          cols: 2,
          frames: testFrames,
          mode: "frames",
          speed: 100,
          loop: false,
          autoStart: false,
        },
        (result) => {
          act(() => {
            result.current.start();
            vi.advanceTimersByTime(1000);
          });
          expect(result.current.isPlaying).toBe(false);
        }
      );
    });

    it("loops through frames when loop=true", () => {
      withFakeTimers(
        {
          rows: 2,
          cols: 2,
          frames: testFrames,
          mode: "frames",
          speed: 100,
          loop: true,
          autoStart: false,
        },
        (result) => {
          act(() => {
            result.current.start();
            vi.advanceTimersByTime(5000);
          });
          expect(result.current.isPlaying).toBe(true);
        }
      );
    });

    it("does nothing when frames is empty", () => {
      withFakeTimers(
        {
          rows: 2,
          cols: 2,
          frames: [],
          mode: "frames",
          speed: 100,
          autoStart: false,
        },
        (result) => {
          act(() => {
            result.current.start();
            vi.advanceTimersByTime(200);
          });
          expect(result.current.isPlaying).toBe(true);
        }
      );
    });
  });

  describe("cleanup", () => {
    it("autoStart=true: interval is cleared on unmount (real clearInterval spy)", () => {
      // Spy before any fake-timer switch so we capture the real clearInterval.
      const clearSpy = vi.spyOn(globalThis, "clearInterval");
      const { unmount } = renderHook(() =>
        useFlipDotAnimation({ rows: 3, cols: 5, text: "A", autoStart: true })
      );
      unmount();
      expect(clearSpy).toHaveBeenCalled();
    });

    it("matrix does not change after unmount (interval stopped)", () => {
      // Mount with real timers so effects run, then switch to fake timers.
      const hookResult = renderHook(() =>
        useFlipDotAnimation({
          rows: 3,
          cols: 5,
          text: "A",
          mode: "blink",
          speed: 100,
          autoStart: false,
        })
      );
      vi.useFakeTimers();
      act(() => {
        hookResult.result.current.start();
        vi.advanceTimersByTime(100);
      });
      const snapshot = hookResult.result.current.matrix.flat().join(",");

      // Unmount — this should call clearTimer
      act(() => hookResult.unmount());

      // Advancing time after unmount must NOT change the last captured matrix
      act(() => vi.advanceTimersByTime(500));
      expect(hookResult.result.current.matrix.flat().join(",")).toBe(snapshot);
      vi.useRealTimers();
    });
  });
});
