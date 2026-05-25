import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSpecsApi } from "./useSpecsApi.js";
import type { StoredSpec } from "../types.js";

vi.mock("@mbe/auth/react", () => ({
  useAuth: vi.fn(() => ({ accessToken: "test-token", user: null, signOut: vi.fn() })),
}));

// Shared mock for all ApiClient method calls
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

// Mock @mbe/api-client — ApiClient must be a class (constructable) in the mock
vi.mock("@mbe/api-client", () => {
  class MockApiClient {
    get = mockGet;
    post = mockPost;
    patch = mockPatch;
    delete = mockDelete;
    request = mockGet;
    getOne = mockGet;
    postOne = mockPost;
    patchOne = mockPatch;
  }
  return {
    ApiClient: MockApiClient,
  };
});

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

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockPatch.mockReset();
  mockDelete.mockReset();
});

describe("useSpecsApi — initial state", () => {
  it("starts with isLoading=true and empty specs array", async () => {
    // Never resolve so we can check loading state
    mockGet.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSpecsApi());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.specs).toEqual([]);
  });
});

describe("useSpecsApi — uses ApiClient not raw fetch", () => {
  it("calls ApiClient.get for fetchSpecs (not globalThis.fetch)", async () => {
    const spec = makeSpec();
    mockGet.mockResolvedValue({ data: [spec] });
    const { result } = renderHook(() => useSpecsApi());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // ApiClient.get was called with the specs endpoint
    expect(mockGet).toHaveBeenCalledWith("/api/gen/specs");
  });
});

describe("useSpecsApi — fetchSpecs", () => {
  it("populates specs from API response and sets isLoading=false", async () => {
    const spec = makeSpec();
    mockGet.mockResolvedValue({ data: [spec] });
    const { result } = renderHook(() => useSpecsApi());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.specs).toHaveLength(1);
    expect(result.current.specs[0]!.id).toBe("spec-1");
  });

  it("sets isLoading=false and leaves specs empty on fetch error", async () => {
    mockGet.mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => useSpecsApi());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.specs).toEqual([]);
  });
});

describe("useSpecsApi — saveSpec", () => {
  it("adds the new spec to the front of the list", async () => {
    const existing = makeSpec({ id: "old-1" });
    mockGet.mockResolvedValueOnce({ data: [existing] });

    const { result } = renderHook(() => useSpecsApi());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const created = makeSpec({ id: "new-1", prompt: "New prompt" });
    mockPost.mockResolvedValueOnce({ data: created });

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
    mockGet.mockResolvedValueOnce({ data: [spec] });

    const { result } = renderHook(() => useSpecsApi());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // The PATCH call resolves successfully
    mockPatch.mockResolvedValueOnce({});

    await act(async () => {
      await result.current.toggleFavorite("spec-1");
    });

    expect(result.current.specs[0]!.isFavorite).toBe(true);
  });

  it("reverts optimistic update on API error", async () => {
    const spec = makeSpec({ isFavorite: false });
    mockGet.mockResolvedValueOnce({ data: [spec] });

    const { result } = renderHook(() => useSpecsApi());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // The PATCH call fails
    mockPatch.mockRejectedValueOnce(new Error("Server Error"));

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
    mockGet.mockResolvedValueOnce({ data: [spec1, spec2] });

    const { result } = renderHook(() => useSpecsApi());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockDelete.mockResolvedValueOnce({});

    await act(async () => {
      await result.current.deleteSpec("spec-1");
    });

    expect(result.current.specs).toHaveLength(1);
    expect(result.current.specs[0]!.id).toBe("spec-2");
  });

  it("reverts optimistic removal on API error", async () => {
    const spec = makeSpec();
    mockGet.mockResolvedValueOnce({ data: [spec] });

    const { result } = renderHook(() => useSpecsApi());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockDelete.mockRejectedValueOnce(new Error("Server Error"));

    await act(async () => {
      await result.current.deleteSpec("spec-1");
    });

    expect(result.current.specs).toHaveLength(1);
    expect(result.current.specs[0]!.id).toBe("spec-1");
  });
});
