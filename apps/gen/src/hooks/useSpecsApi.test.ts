import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSpecsApi } from "./useSpecsApi.js";
import type { StoredSpec } from "../types.js";

vi.mock("@mbe/auth/react", () => ({
  useAuth: vi.fn(() => ({ accessToken: "test-token", user: null, signOut: vi.fn() })),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeSpec(overrides?: Partial<StoredSpec>): StoredSpec {
  return {
    id: "spec-1",
    userId: "user-1",
    prompt: "A button",
    spec: { type: "Button" },
    rawLines: ['{"type":"Button"}'],
    isFavorite: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeOkResponse(body: unknown) {
  return {
    ok: true,
    statusText: "OK",
    json: async () => body,
  };
}

function makeErrorResponse(statusText = "Internal Server Error") {
  return {
    ok: false,
    statusText,
    json: async () => ({}),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("useSpecsApi — initial state", () => {
  it("starts with isLoading=true and empty specs array", async () => {
    // Never resolve so we can check loading state
    mockFetch.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSpecsApi());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.specs).toEqual([]);
  });
});

describe("useSpecsApi — fetchSpecs", () => {
  it("populates specs from API response and sets isLoading=false", async () => {
    const spec = makeSpec();
    mockFetch.mockResolvedValue(makeOkResponse({ data: [spec] }));
    const { result } = renderHook(() => useSpecsApi());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.specs).toHaveLength(1);
    expect(result.current.specs[0]!.id).toBe("spec-1");
  });

  it("sets isLoading=false and leaves specs empty on fetch error", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => useSpecsApi());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.specs).toEqual([]);
  });
});

describe("useSpecsApi — saveSpec", () => {
  it("adds the new spec to the front of the list", async () => {
    const existing = makeSpec({ id: "old-1" });
    mockFetch.mockResolvedValueOnce(makeOkResponse({ data: [existing] }));

    const { result } = renderHook(() => useSpecsApi());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const created = makeSpec({ id: "new-1", prompt: "New prompt" });
    mockFetch.mockResolvedValueOnce(makeOkResponse({ data: created }));

    await act(async () => {
      await result.current.saveSpec({
        prompt: "New prompt",
        spec: { type: "Text" },
        rawLines: ['{"type":"Text"}'],
      });
    });

    expect(result.current.specs).toHaveLength(2);
    expect(result.current.specs[0]!.id).toBe("new-1");
    expect(result.current.specs[1]!.id).toBe("old-1");
  });
});

describe("useSpecsApi — toggleFavorite", () => {
  it("optimistically flips isFavorite", async () => {
    const spec = makeSpec({ isFavorite: false });
    mockFetch.mockResolvedValueOnce(makeOkResponse({ data: [spec] }));

    const { result } = renderHook(() => useSpecsApi());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // The PATCH call resolves successfully
    mockFetch.mockResolvedValueOnce(makeOkResponse({}));

    await act(async () => {
      await result.current.toggleFavorite("spec-1");
    });

    expect(result.current.specs[0]!.isFavorite).toBe(true);
  });

  it("reverts optimistic update on API error", async () => {
    const spec = makeSpec({ isFavorite: false });
    mockFetch.mockResolvedValueOnce(makeOkResponse({ data: [spec] }));

    const { result } = renderHook(() => useSpecsApi());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // The PATCH call fails
    mockFetch.mockResolvedValueOnce(makeErrorResponse("Server Error"));

    await act(async () => {
      await result.current.toggleFavorite("spec-1");
    });

    // Should be reverted back to false
    expect(result.current.specs[0]!.isFavorite).toBe(false);
  });
});

describe("useSpecsApi — deleteSpec", () => {
  it("removes spec optimistically", async () => {
    const spec1 = makeSpec({ id: "spec-1" });
    const spec2 = makeSpec({ id: "spec-2", prompt: "Another" });
    mockFetch.mockResolvedValueOnce(makeOkResponse({ data: [spec1, spec2] }));

    const { result } = renderHook(() => useSpecsApi());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockFetch.mockResolvedValueOnce(makeOkResponse({}));

    await act(async () => {
      await result.current.deleteSpec("spec-1");
    });

    expect(result.current.specs).toHaveLength(1);
    expect(result.current.specs[0]!.id).toBe("spec-2");
  });

  it("reverts optimistic removal on API error", async () => {
    const spec = makeSpec();
    mockFetch.mockResolvedValueOnce(makeOkResponse({ data: [spec] }));

    const { result } = renderHook(() => useSpecsApi());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockFetch.mockResolvedValueOnce(makeErrorResponse("Server Error"));

    await act(async () => {
      await result.current.deleteSpec("spec-1");
    });

    expect(result.current.specs).toHaveLength(1);
    expect(result.current.specs[0]!.id).toBe("spec-1");
  });
});
