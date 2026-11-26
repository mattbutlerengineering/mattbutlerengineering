import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useInviteMember, useMembers, useRevokeMember } from "./useRegularsClub.js";

const mockListMembers = vi.fn();
const mockInviteMember = vi.fn();
const mockRevokeMember = vi.fn();

vi.mock("./useApiClient.js", () => ({
  useApiClient: () => ({
    guests: {
      listMembers: mockListMembers,
      inviteMember: mockInviteMember,
      revokeMember: mockRevokeMember,
    },
  }),
}));

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

describe("useRegularsClub", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists members for the venue", async () => {
    mockListMembers.mockResolvedValue([{ id: "m1" }]);
    const { result } = renderHook(() => useMembers({ venueId: "venue-1" }), {
      wrapper: setup().wrapper,
    });

    await waitFor(() => expect(result.current.data).toEqual([{ id: "m1" }]));
    expect(mockListMembers).toHaveBeenCalledWith("venue-1");
  });

  it("does not fetch without a venue", () => {
    renderHook(() => useMembers({ venueId: null }), { wrapper: setup().wrapper });
    expect(mockListMembers).not.toHaveBeenCalled();
  });

  it("invites by email and refreshes the member list", async () => {
    mockInviteMember.mockResolvedValue({ id: "m1" });
    const { queryClient, wrapper } = setup();
    queryClient.setQueryData(["guestMembers", { venueId: "venue-1" }], []);
    const { result } = renderHook(() => useInviteMember(), { wrapper });

    await result.current.mutateAsync({ venueId: "venue-1", email: "a@b.co", name: "A" });

    expect(mockInviteMember).toHaveBeenCalledWith({
      venueId: "venue-1",
      email: "a@b.co",
      name: "A",
    });
    expect(queryClient.getQueryState(["guestMembers", { venueId: "venue-1" }])?.isInvalidated).toBe(
      true
    );
  });

  it("revokes by guest id", async () => {
    mockRevokeMember.mockResolvedValue({ revoked: true });
    const { result } = renderHook(() => useRevokeMember(), { wrapper: setup().wrapper });

    await result.current.mutateAsync("g1");

    expect(mockRevokeMember).toHaveBeenCalledWith("g1");
  });
});
