import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCopyToClipboard } from "./useCopyToClipboard.js";

describe("useCopyToClipboard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with copied=false", () => {
    const { result } = renderHook(() => useCopyToClipboard());
    expect(result.current.copied).toBe(false);
  });

  it("copies text and sets copied=true", async () => {
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => {
      await result.current.copy("hello world");
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("hello world");
    expect(result.current.copied).toBe(true);
  });

  it("resets copied to false after 2s", async () => {
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => {
      await result.current.copy("hello");
    });
    expect(result.current.copied).toBe(true);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.copied).toBe(false);
  });

  it("falls back to window.prompt when clipboard API fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue(null);

    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => {
      await result.current.copy("fallback text");
    });
    expect(promptSpy).toHaveBeenCalledWith("Copy to clipboard:", "fallback text");
    // copied should still be true after fallback
    expect(result.current.copied).toBe(true);
    promptSpy.mockRestore();
  });

  it("handles missing clipboard API (no writeText)", async () => {
    Object.assign(navigator, { clipboard: {} });
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue(null);

    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => {
      await result.current.copy("no clipboard");
    });
    expect(promptSpy).toHaveBeenCalledWith("Copy to clipboard:", "no clipboard");
    expect(result.current.copied).toBe(true);
    promptSpy.mockRestore();
  });

  it("clears previous timeout when copy is called multiple times", async () => {
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => {
      await result.current.copy("first");
    });
    expect(result.current.copied).toBe(true);
    // Advance 1s (not enough for full reset)
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    await act(async () => {
      await result.current.copy("second");
    });
    expect(result.current.copied).toBe(true);
    // Advance 2s from the second copy, should reset
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.copied).toBe(false);
  });
});
