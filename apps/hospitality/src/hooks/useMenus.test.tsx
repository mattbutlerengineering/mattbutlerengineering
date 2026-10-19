import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { MenuWithSections } from "@mbe/api-client";

const { mockUpdateItem } = vi.hoisted(() => ({ mockUpdateItem: vi.fn() }));

vi.mock("./useApiClient.js", () => ({
  useApiClient: vi.fn(() => ({ menus: { updateItem: mockUpdateItem } })),
}));

import { menuQueryKey, useToggleItemSoldOut } from "./useMenus.js";

const menu: MenuWithSections = {
  id: "m1",
  venueId: "v1",
  name: "Dinner",
  slug: "dinner",
  description: null,
  status: "ACTIVE",
  displayOrder: 0,
  createdAt: "2026-10-18T00:00:00Z",
  updatedAt: "2026-10-18T00:00:00Z",
  sections: [
    {
      id: "s1",
      venueId: "v1",
      menuId: "m1",
      name: "Starters",
      displayOrder: 0,
      items: [
        {
          id: "i1",
          venueId: "v1",
          sectionId: "s1",
          name: "Soup",
          description: null,
          priceCents: 850,
          status: "AVAILABLE",
          displayOrder: 0,
        },
      ],
    },
  ],
};

const target = { venueId: "v1", menuId: "m1", sectionId: "s1", itemId: "i1" };

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(menuQueryKey("v1", "m1"), menu);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const statusInCache = () =>
    queryClient.getQueryData<MenuWithSections>(menuQueryKey("v1", "m1"))?.sections[0]?.items[0]
      ?.status;
  return { wrapper, statusInCache };
}

describe("useToggleItemSoldOut", () => {
  beforeEach(() => mockUpdateItem.mockReset());

  it("flips the cached item before the request settles", async () => {
    let resolve!: () => void;
    mockUpdateItem.mockReturnValueOnce(new Promise<void>((r) => (resolve = r)));
    const { wrapper, statusInCache } = setup();
    const { result } = renderHook(() => useToggleItemSoldOut(), { wrapper });

    act(() => result.current.mutate({ ...target, soldOut: true }));

    await waitFor(() => expect(statusInCache()).toBe("SOLD_OUT"));
    expect(mockUpdateItem).toHaveBeenCalledWith("v1", "m1", "s1", "i1", { status: "SOLD_OUT" });
    await act(async () => resolve());
  });

  it("rolls the cache back when the request fails", async () => {
    mockUpdateItem.mockRejectedValueOnce(new Error("boom"));
    const { wrapper, statusInCache } = setup();
    const { result } = renderHook(() => useToggleItemSoldOut(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ ...target, soldOut: true }).catch(() => {});
    });

    expect(statusInCache()).toBe("AVAILABLE");
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("sends AVAILABLE when un-marking sold out", async () => {
    mockUpdateItem.mockResolvedValueOnce(menu.sections[0]!.items[0]);
    const { wrapper } = setup();
    const { result } = renderHook(() => useToggleItemSoldOut(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ ...target, soldOut: false });
    });

    expect(mockUpdateItem).toHaveBeenCalledWith("v1", "m1", "s1", "i1", { status: "AVAILABLE" });
  });
});
