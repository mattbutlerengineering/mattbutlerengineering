import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useCurrentUser, useUsers } from "./useUsers.js";
import type { User } from "@mbe/types";

/* ── Mocks ──────────────────────────────────────────── */

const mockMe = vi.fn();
const mockList = vi.fn();

vi.mock("./useApiClient.js", () => ({
  useApiClient: () => ({
    users: {
      me: mockMe,
      list: mockList,
    },
  }),
}));

/* ── Helpers ────────────────────────────────────────── */

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    name: "Matt Butler",
    email: "matt@example.com",
    picture: null,
    emailVerified: true,
    preferences: { theme: "system", emailNotifications: true, marketingEmails: false },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

/* ── Tests: useCurrentUser ──────────────────────────── */

describe("useCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns loading state initially", () => {
    mockMe.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCurrentUser(), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(true);
  });

  it("returns current user on success", async () => {
    const user = makeUser();
    mockMe.mockResolvedValue(user);

    const { result } = renderHook(() => useCurrentUser(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(user);
    expect(result.current.error).toBeNull();
  });

  it("returns error on failure", async () => {
    mockMe.mockRejectedValue(new Error("Unauthorized"));

    const { result } = renderHook(() => useCurrentUser(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("returns null data when query has no data yet", () => {
    mockMe.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCurrentUser(), { wrapper: createWrapper() });
    // data is null when undefined (not yet fetched)
    expect(result.current.data).toBeNull();
  });
});

/* ── Tests: useUsers ────────────────────────────────── */

describe("useUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns users on success", async () => {
    const users = [makeUser({ id: "u1" }), makeUser({ id: "u2" })];
    mockList.mockResolvedValue({
      data: users,
      pagination: { page: 1, limit: 10, total: 2, totalPages: 1, hasNext: false },
    });

    const { result } = renderHook(() => useUsers(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(users);
    expect(result.current.pagination?.total).toBe(2);
  });

  it("does not fetch when enabled is false", () => {
    const { result } = renderHook(() => useUsers({ enabled: false }), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(false);
    expect(mockList).not.toHaveBeenCalled();
  });
});
