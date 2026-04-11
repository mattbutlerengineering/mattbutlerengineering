import { useCallback, useEffect, useRef, useState } from "react";
import { textToMatrix, createEmptyMatrix } from "./pixel-font";

export type FlipDotAnimationMode =
  | "typewriter"
  | "scroll-left"
  | "scroll-right"
  | "blink"
  | "frames";

export interface UseFlipDotAnimationOptions {
  /** Text to render (used by typewriter, scroll, blink modes). */
  text?: string;
  /** Pre-built frame sequence (used by "frames" mode). */
  frames?: readonly (readonly (readonly boolean[])[])[];
  /** Display row count. */
  rows: number;
  /** Display column count. */
  cols: number;
  /** Animation mode. @default "scroll-left" */
  mode?: FlipDotAnimationMode;
  /** Milliseconds per animation step. @default 150 */
  speed?: number;
  /** Loop when the animation completes. @default false */
  loop?: boolean;
  /** Start automatically on mount. @default true */
  autoStart?: boolean;
}

export interface UseFlipDotAnimationReturn {
  matrix: readonly (readonly boolean[])[];
  start: () => void;
  pause: () => void;
  reset: () => void;
  isPlaying: boolean;
}

/**
 * Drives animated content on a FlipDot display.
 *
 * Produces a `matrix` value that updates over time according to the chosen `mode`.
 * Feed the returned matrix directly into `<FlipDot matrix={matrix} />`.
 */
export function useFlipDotAnimation(
  options: UseFlipDotAnimationOptions,
): UseFlipDotAnimationReturn {
  const {
    text = "",
    frames,
    rows,
    cols,
    mode = "scroll-left",
    speed = 150,
    loop = false,
    autoStart = true,
  } = options;

  const empty = createEmptyMatrix(rows, cols);
  const [matrix, setMatrix] = useState<readonly (readonly boolean[])[]>(empty);
  const [isPlaying, setIsPlaying] = useState(false);

  const stepRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pre-compute the full text matrix (wider than the display for scrolling)
  const fullMatrixRef = useRef<readonly (readonly boolean[])[]>(empty);
  useEffect(() => {
    if (text && mode !== "frames") {
      fullMatrixRef.current = textToMatrix(text, { rows });
    }
  }, [text, rows, mode]);

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const sliceColumns = useCallback(
    (
      source: readonly (readonly boolean[])[],
      startCol: number,
      width: number,
    ): readonly (readonly boolean[])[] => {
      return source.map((row) => {
        const result: boolean[] = [];
        for (let i = 0; i < width; i++) {
          const srcCol = startCol + i;
          result.push(
            srcCol >= 0 && srcCol < row.length ? (row[srcCol] ?? false) : false,
          );
        }
        return result;
      });
    },
    [],
  );

  const tick = useCallback(() => {
    const step = stepRef.current;
    const full = fullMatrixRef.current;
    const fullWidth = full[0]?.length ?? 0;

    switch (mode) {
      case "typewriter": {
        // Reveal one column at a time from the left
        const visibleCols = Math.min(step + 1, cols, fullWidth);
        const sliced = sliceColumns(full, 0, visibleCols);
        // Pad to full display width
        setMatrix(
          sliced.map((row) => [
            ...row,
            ...Array<boolean>(Math.max(0, cols - row.length)).fill(false),
          ]),
        );
        if (visibleCols >= Math.min(cols, fullWidth)) {
          if (loop) {
            stepRef.current = 0;
          } else {
            clearTimer();
            setIsPlaying(false);
          }
          return;
        }
        break;
      }

      case "scroll-left": {
        const totalWidth = fullWidth + cols; // scroll fully off-screen
        const offset = step - cols; // start off-screen right
        setMatrix(sliceColumns(full, offset, cols));
        if (step >= totalWidth) {
          if (loop) {
            stepRef.current = 0;
          } else {
            clearTimer();
            setIsPlaying(false);
          }
          return;
        }
        break;
      }

      case "scroll-right": {
        const totalWidth = fullWidth + cols;
        const offset = fullWidth - step; // start off-screen left
        setMatrix(sliceColumns(full, offset, cols));
        if (step >= totalWidth) {
          if (loop) {
            stepRef.current = 0;
          } else {
            clearTimer();
            setIsPlaying(false);
          }
          return;
        }
        break;
      }

      case "blink": {
        const show = step % 2 === 0;
        setMatrix(show ? sliceColumns(full, 0, cols) : empty);
        break;
      }

      case "frames": {
        if (!frames || frames.length === 0) return;
        const frameIndex = loop
          ? step % frames.length
          : Math.min(step, frames.length - 1);
        setMatrix(frames[frameIndex]!);
        if (!loop && step >= frames.length - 1) {
          clearTimer();
          setIsPlaying(false);
          return;
        }
        break;
      }
    }

    stepRef.current += 1;
  }, [mode, cols, loop, frames, empty, sliceColumns, clearTimer]);

  const start = useCallback(() => {
    clearTimer();
    setIsPlaying(true);
    intervalRef.current = setInterval(tick, speed);
  }, [clearTimer, tick, speed]);

  const pause = useCallback(() => {
    clearTimer();
    setIsPlaying(false);
  }, [clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    stepRef.current = 0;
    setMatrix(empty);
    setIsPlaying(false);
  }, [clearTimer, empty]);

  // Auto-start on mount — setState here is intentional (sync initial state with timer)
  useEffect(() => {
    if (autoStart) {
      stepRef.current = 0;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional mount sync
      setIsPlaying(true);
      intervalRef.current = setInterval(tick, speed);
    }
    return clearTimer;
  }, [autoStart, tick, speed, clearTimer]);

  return { matrix, start, pause, reset, isPlaying };
}
