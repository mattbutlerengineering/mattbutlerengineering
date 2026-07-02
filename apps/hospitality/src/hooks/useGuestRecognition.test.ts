/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGuestRecognition } from "./useGuestRecognition.js";

const mockApi = {
  guests: {
    recognize: vi.fn(),
  },
};

describe("useGuestRecognition", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns idle state initially", () => {
    const { result } = renderHook(() =>
      useGuestRecognition({ venueSlug: "the-grill", api: mockApi as any })
    );

    expect(result.current.result).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("does not fetch when email is empty", async () => {
    const { result } = renderHook(() =>
      useGuestRecognition({ venueSlug: "the-grill", api: mockApi as any })
    );

    await act(async () => {
      result.current.recognize("");
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });

    expect(mockApi.guests.recognize).not.toHaveBeenCalled();
  });

  it("does not fetch when venueSlug is absent", async () => {
    const { result } = renderHook(() =>
      useGuestRecognition({ venueSlug: undefined, api: mockApi as any })
    );

    await act(async () => {
      result.current.recognize("jane@example.com");
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });

    expect(mockApi.guests.recognize).not.toHaveBeenCalled();
  });

  it("debounces — recognize not called before 300ms", async () => {
    mockApi.guests.recognize.mockResolvedValue({
      recognized: false,
      firstName: null,
      visitCount: 0,
      hasPreferences: false,
      lastVisit: null,
    });

    const { result } = renderHook(() =>
      useGuestRecognition({ venueSlug: "the-grill", api: mockApi as any })
    );

    act(() => {
      result.current.recognize("jane@example.com");
      vi.advanceTimersByTime(299);
    });

    expect(mockApi.guests.recognize).not.toHaveBeenCalled();
  });

  it("calls api.guests.recognize after 300ms debounce with venueSlug and email", async () => {
    mockApi.guests.recognize.mockResolvedValue({
      recognized: false,
      firstName: null,
      visitCount: 0,
      hasPreferences: false,
      lastVisit: null,
    });

    const { result } = renderHook(() =>
      useGuestRecognition({ venueSlug: "the-grill", api: mockApi as any })
    );

    await act(async () => {
      result.current.recognize("jane@example.com");
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockApi.guests.recognize).toHaveBeenCalledWith("the-grill", "jane@example.com");
  });

  it("rapid calls only fire one recognize call (last one wins)", async () => {
    mockApi.guests.recognize.mockResolvedValue({
      recognized: false,
      firstName: null,
      visitCount: 0,
      hasPreferences: false,
      lastVisit: null,
    });

    const { result } = renderHook(() =>
      useGuestRecognition({ venueSlug: "the-grill", api: mockApi as any })
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

    expect(mockApi.guests.recognize).toHaveBeenCalledTimes(1);
    expect(mockApi.guests.recognize).toHaveBeenCalledWith("the-grill", "abc@example.com");
  });

  it("populates result on recognized guest (no phone)", async () => {
    mockApi.guests.recognize.mockResolvedValue({
      recognized: true,
      firstName: "Jane",
      visitCount: 5,
      hasPreferences: true,
      lastVisit: "2026-01-01",
    });

    const { result } = renderHook(() =>
      useGuestRecognition({ venueSlug: "the-grill", api: mockApi as any })
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
    mockApi.guests.recognize.mockResolvedValue({
      recognized: false,
      firstName: null,
      visitCount: 0,
      hasPreferences: false,
      lastVisit: null,
    });

    const { result } = renderHook(() =>
      useGuestRecognition({ venueSlug: "the-grill", api: mockApi as any })
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
    mockApi.guests.recognize.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() =>
      useGuestRecognition({ venueSlug: "the-grill", api: mockApi as any })
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

  it("yields error state when the API call rejects (e.g. rate limited)", async () => {
    mockApi.guests.recognize.mockRejectedValue(new Error("Rate limited"));

    const { result } = renderHook(() =>
      useGuestRecognition({ venueSlug: "the-grill", api: mockApi as any })
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
    mockApi.guests.recognize
      .mockResolvedValueOnce({
        recognized: true,
        firstName: "Jane",
        visitCount: 1,
        hasPreferences: false,
        lastVisit: null,
      })
      .mockResolvedValueOnce({
        recognized: false,
        firstName: null,
        visitCount: 0,
        hasPreferences: false,
        lastVisit: null,
      });

    const { result } = renderHook(() =>
      useGuestRecognition({ venueSlug: "the-grill", api: mockApi as any })
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
    let resolveRecognize!: (v: unknown) => void;
    const pending = new Promise((res) => {
      resolveRecognize = res;
    });
    mockApi.guests.recognize.mockReturnValue(pending);

    const { result } = renderHook(() =>
      useGuestRecognition({ venueSlug: "the-grill", api: mockApi as any })
    );

    act(() => {
      result.current.recognize("jane@example.com");
      vi.advanceTimersByTime(300);
    });

    // After timer fires but before the promise resolves — still loading
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(true);

    // Resolve the recognize call
    await act(async () => {
      resolveRecognize({
        recognized: false,
        firstName: null,
        visitCount: 0,
        hasPreferences: false,
        lastVisit: null,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(false);
  });
});
