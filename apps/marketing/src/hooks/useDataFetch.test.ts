import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useDataFetch } from "./useDataFetch.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useDataFetch", () => {
  describe("success path", () => {
    it("starts with isLoading=true, data=null, error=null", () => {
      mockFetch.mockReturnValue(new Promise(() => {}));
      const { result } = renderHook(() => useDataFetch({ url: "/test.json" }));

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it("sets data and clears loading after successful fetch", async () => {
      const payload = { value: 42 };
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => payload,
      });

      const { result } = renderHook(() => useDataFetch<typeof payload>({ url: "/test.json" }));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.data).toEqual(payload);
      expect(result.current.error).toBeNull();
    });

    it("passes raw JSON through parser when provided", async () => {
      const raw = { value: "42" };
      const parser = (data: unknown) => ({ parsed: (data as typeof raw).value });
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => raw,
      });

      const { result } = renderHook(() => useDataFetch({ url: "/test.json", parser }));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.data).toEqual({ parsed: "42" });
    });

    it("fetches the provided URL", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
      renderHook(() => useDataFetch({ url: "/specific-url.json" }));

      await waitFor(() =>
        expect(mockFetch).toHaveBeenCalledWith(
          "/specific-url.json",
          expect.objectContaining({ signal: expect.any(AbortSignal) })
        )
      );
    });
  });

  describe("error path", () => {
    it("sets error when fetch rejects", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useDataFetch({ url: "/test.json" }));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe("Network error");
      expect(result.current.data).toBeNull();
    });

    it("sets error when response is not ok", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      const { result } = renderHook(() => useDataFetch({ url: "/test.json" }));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toContain("404");
      expect(result.current.data).toBeNull();
    });

    it("wraps non-Error rejections in an Error", async () => {
      mockFetch.mockRejectedValue("string error");

      const { result } = renderHook(() => useDataFetch({ url: "/test.json" }));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.error).toBeInstanceOf(Error);
    });
  });

  describe("unmount abort", () => {
    it("does not set state after unmount (abort on unmount)", async () => {
      let resolveFetch!: (value: unknown) => void;
      mockFetch.mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
      );

      const { result, unmount } = renderHook(() => useDataFetch({ url: "/test.json" }));
      expect(result.current.isLoading).toBe(true);

      unmount();

      // Resolve after unmount — should not cause a state update
      act(() => {
        resolveFetch({ ok: true, json: async () => ({ value: 1 }) });
      });

      // State should remain as initial (no updates after unmount)
      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeNull();
    });

    it("aborts the fetch signal on unmount", async () => {
      let capturedSignal: AbortSignal | undefined;
      mockFetch.mockImplementation((_url: string, opts: RequestInit) => {
        capturedSignal = opts.signal as AbortSignal;
        return new Promise(() => {});
      });

      const { unmount } = renderHook(() => useDataFetch({ url: "/test.json" }));

      expect(capturedSignal?.aborted).toBe(false);

      unmount();

      expect(capturedSignal?.aborted).toBe(true);
    });
  });

  describe("refetch", () => {
    it("exposes a refetch function that re-triggers the fetch", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ v: 1 }) });

      const { result } = renderHook(() => useDataFetch<{ v: number }>({ url: "/test.json" }));
      await waitFor(() => expect(result.current.data).toEqual({ v: 1 }));

      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ v: 2 }) });
      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.data).toEqual({ v: 2 });
    });
  });
});
