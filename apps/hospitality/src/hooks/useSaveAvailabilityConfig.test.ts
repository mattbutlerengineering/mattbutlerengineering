import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useSaveAvailabilityConfig } from "./useAvailability.js";

const mockSave = vi.fn();
const mockGet = vi.fn();

vi.mock("./useApiClient.js", () => ({
  useApiClient: () => ({ availability: { saveConfig: mockSave, getConfig: mockGet } }),
}));

const BODY = {
  expectedVersion: 3,
  changes: { upsert: {}, remove: {} },
  scopeConflicts: "keep" as const,
};

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { invalidate, ...renderHook(() => useSaveAvailabilityConfig(), { wrapper }) };
}

describe("useSaveAvailabilityConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSave.mockResolvedValue({ version: 4, changeId: "chg-1" });
  });

  it("saves against the version the draft was made on, then refreshes the calendar and config", async () => {
    const { result, invalidate } = setup();
    await act(() => result.current.mutateAsync({ venueId: "v1", body: BODY }));

    expect(mockGet).not.toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalledWith("v1", BODY);
    const keys = invalidate.mock.calls.map(([filter]) => filter?.queryKey?.[0]);
    expect(keys).toEqual(expect.arrayContaining(["availabilityDays", "availabilityConfig"]));
  });

  it("overwrite saves against the version the server holds now", async () => {
    mockGet.mockResolvedValue({ version: 7 });
    const { result } = setup();
    await act(() => result.current.mutateAsync({ venueId: "v1", body: BODY, overwrite: true }));

    expect(mockSave).toHaveBeenCalledWith("v1", { ...BODY, expectedVersion: 7 });
  });
});
