import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGuestRecognition } from "./useGuestRecognition.js";

describe("useGuestRecognition", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns idle state initially", () => {
    const { result } = renderHook(() =>
      useGuestRecognition({ venueSlug: "the-grill", apiBaseUrl: "https://api.example.com" })
    );

    expect(result.current.result).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("does not fetch when email is empty", async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    const { result } = renderHook(() =>
      useGuestRecognition({ venueSlug: "the-grill", apiBaseUrl: "https://api.example.com" })
    );

    await act(async () => {
      result.current.recognize("");
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not fetch when venueSlug is absent", async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    const { result } = renderHook(() =>
      useGuestRecognition({ venueSlug: undefined, apiBaseUrl: "https://api.example.com" })
    );

    await act(async () => {
      result.current.recognize("jane@example.com");
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("debounces — fetch not called before 300ms", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ recognized: false }),
    });
    global.fetch = mockFetch;

    const { result } = renderHook(() =>
      useGuestRecognition({ venueSlug: "the-grill", apiBaseUrl: "https://api.example.com" })
    );

    act(() => {
      result.current.recognize("jane@example.com");
      vi.advanceTimersByTime(299);
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches after 300ms debounce with correct URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ recognized: false }),
    });
    global.fetch = mockFetch;

    const { result } = renderHook(() =>
      useGuestRecognition({ venueSlug: "the-grill", apiBaseUrl: "https://api.example.com" })
    );

    await act(async () => {
      result.current.recognize("jane@example.com");
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/public/v1/venues/the-grill/guests/recognize?email=jane%40example.com"
    );
  });

  it("rapid calls only fire one fetch (last one wins)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ recognized: false }),
    });
    global.fetch = mockFetch;

    const { result } = renderHook(() =>
      useGuestRecognition({ venueSlug: "the-grill", apiBaseUrl: "https://api.example.com" })
    );

    await act(async () => {
      result.current.recognize("a@example.com");
      vi.advanceTimersByTime(100);
      result.current.recognize("ab@example.com");
      vi.advanceTimersByTime(100);
      result.current.recognize("abc@example.com");
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/public/v1/venues/the-grill/guests/recognize?email=abc%40example.com"
    );
  });

  it("populates result on recognized guest (no phone)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        recognized: true,
        firstName: "Jane",
        phone: "555-999-0000",
        visitCount: 5,
        hasPreferences: true,
      }),
    });
    global.fetch = mockFetch;

    const { result } = renderHook(() =>
      useGuestRecognition({ venueSlug: "the-grill", apiBaseUrl: "https://api.example.com" })
    );

    await act(async () => {
      result.current.recognize("jane@example.com");
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.result).toEqual({
      firstName: "Jane",
      visitCount: 5,
      hasPreferences: true,
    });
    expect(result.current.result).not.toHaveProperty("phone");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("yields null result when guest is not recognized", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ recognized: false }),
    });
    global.fetch = mockFetch;

    const { result } = renderHook(() =>
      useGuestRecognition({ venueSlug: "the-grill", apiBaseUrl: "https://api.example.com" })
    );

    await act(async () => {
      result.current.recognize("new@example.com");
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("yields error state on network failure", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    global.fetch = mockFetch;

    const { result } = renderHook(() =>
      useGuestRecognition({ venueSlug: "the-grill", apiBaseUrl: "https://api.example.com" })
    );

    await act(async () => {
      result.current.recognize("jane@example.com");
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.isLoading).toBe(false);
  });

  it("yields error state on non-ok HTTP response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    global.fetch = mockFetch;

    const { result } = renderHook(() =>
      useGuestRecognition({ venueSlug: "the-grill", apiBaseUrl: "https://api.example.com" })
    );

    await act(async () => {
      result.current.recognize("jane@example.com");
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("clears previous result and error when a new recognize call fires", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          recognized: true,
          firstName: "Jane",
          visitCount: 1,
          hasPreferences: false,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recognized: false }),
      });
    global.fetch = mockFetch;

    const { result } = renderHook(() =>
      useGuestRecognition({ venueSlug: "the-grill", apiBaseUrl: "https://api.example.com" })
    );

    // First call — recognized
    await act(async () => {
      result.current.recognize("jane@example.com");
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.result).not.toBeNull();

    // Second call — not recognized; result should clear
    await act(async () => {
      result.current.recognize("new@example.com");
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.result).toBeNull();
  });

  it("sets isLoading during in-flight request", async () => {
    let resolveJson!: (v: unknown) => void;
    const jsonPromise = new Promise((res) => {
      resolveJson = res;
    });
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => jsonPromise,
    });
    global.fetch = mockFetch;

    const { result } = renderHook(() =>
      useGuestRecognition({ venueSlug: "the-grill", apiBaseUrl: "https://api.example.com" })
    );

    act(() => {
      result.current.recognize("jane@example.com");
      vi.advanceTimersByTime(300);
    });

    // After timer fires but before json resolves — still loading
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(true);

    // Resolve the json
    await act(async () => {
      resolveJson({ recognized: false });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(false);
  });
});
