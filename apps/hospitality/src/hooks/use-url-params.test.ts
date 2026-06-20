import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { z } from "zod";

// Mock react-router-dom before importing the hook
const mockSearchParams = vi.fn();
const mockSetSearchParams = vi.fn();

vi.mock("react-router-dom", () => ({
  useSearchParams: () => [mockSearchParams(), mockSetSearchParams],
}));

// Import after mock is set up
const { useUrlParams } = await import("./use-url-params.js");

const filterSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .default("2026-01-01"),
  status: z.enum(["all", "CONFIRMED", "PENDING", "CANCELLED"]).default("all"),
});

const DEFAULTS = filterSchema.parse({});

function makeSearchParams(entries: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams(entries);
}

describe("useUrlParams - parsing", () => {
  it("returns defaults when URL has no params", () => {
    mockSearchParams.mockReturnValue(makeSearchParams());

    const { result } = renderHook(() => useUrlParams(filterSchema, DEFAULTS));

    expect(result.current.params.date).toBe("2026-01-01");
    expect(result.current.params.status).toBe("all");
  });

  it("returns parsed values when URL has valid params", () => {
    mockSearchParams.mockReturnValue(makeSearchParams({ date: "2026-06-19", status: "CONFIRMED" }));

    const { result } = renderHook(() => useUrlParams(filterSchema, DEFAULTS));

    expect(result.current.params.date).toBe("2026-06-19");
    expect(result.current.params.status).toBe("CONFIRMED");
  });

  it("falls back to defaults for invalid values", () => {
    mockSearchParams.mockReturnValue(
      makeSearchParams({ date: "not-a-date", status: "INVALID_STATUS" })
    );

    const { result } = renderHook(() => useUrlParams(filterSchema, DEFAULTS));

    expect(result.current.params.date).toBe("2026-01-01");
    expect(result.current.params.status).toBe("all");
  });

  it("falls back per-field: valid date but invalid status falls back status only", () => {
    mockSearchParams.mockReturnValue(makeSearchParams({ date: "2026-06-19", status: "BOGUS" }));

    const { result } = renderHook(() => useUrlParams(filterSchema, DEFAULTS));

    expect(result.current.params.date).toBe("2026-06-19");
    expect(result.current.params.status).toBe("all");
  });

  it("partially populates: missing status gets default, valid date is used", () => {
    mockSearchParams.mockReturnValue(makeSearchParams({ date: "2026-03-15" }));

    const { result } = renderHook(() => useUrlParams(filterSchema, DEFAULTS));

    expect(result.current.params.date).toBe("2026-03-15");
    expect(result.current.params.status).toBe("all");
  });
});

describe("useUrlParams - setters", () => {
  it("setParam calls setSearchParams with updated value", () => {
    mockSearchParams.mockReturnValue(makeSearchParams({ date: "2026-01-01", status: "all" }));
    mockSetSearchParams.mockClear();

    const { result } = renderHook(() => useUrlParams(filterSchema, DEFAULTS));

    act(() => {
      result.current.setParam("status", "CONFIRMED");
    });

    expect(mockSetSearchParams).toHaveBeenCalledTimes(1);
    // The updater function should set the new param
    const updater = mockSetSearchParams.mock.calls[0][0];
    const prev = makeSearchParams({ date: "2026-01-01", status: "all" });
    const next = updater(prev);
    expect(next.get("status")).toBe("CONFIRMED");
    expect(next.get("date")).toBe("2026-01-01");
  });

  it("setParam preserves other params while updating target", () => {
    mockSearchParams.mockReturnValue(makeSearchParams({ date: "2026-06-19", status: "PENDING" }));
    mockSetSearchParams.mockClear();

    const { result } = renderHook(() => useUrlParams(filterSchema, DEFAULTS));

    act(() => {
      result.current.setParam("date", "2026-07-04");
    });

    const updater = mockSetSearchParams.mock.calls[0][0];
    const prev = makeSearchParams({ date: "2026-06-19", status: "PENDING" });
    const next = updater(prev);
    expect(next.get("date")).toBe("2026-07-04");
    expect(next.get("status")).toBe("PENDING");
  });
});

describe("useUrlParams - string-only schema", () => {
  const tokenSchema = z.object({
    token: z.string().default(""),
  });
  const TOKEN_DEFAULTS = tokenSchema.parse({});

  it("reads a string token from URL", () => {
    mockSearchParams.mockReturnValue(makeSearchParams({ token: "abc123" }));

    const { result } = renderHook(() => useUrlParams(tokenSchema, TOKEN_DEFAULTS));

    expect(result.current.params.token).toBe("abc123");
  });

  it("returns empty string default when token is missing", () => {
    mockSearchParams.mockReturnValue(makeSearchParams());

    const { result } = renderHook(() => useUrlParams(tokenSchema, TOKEN_DEFAULTS));

    expect(result.current.params.token).toBe("");
  });
});
