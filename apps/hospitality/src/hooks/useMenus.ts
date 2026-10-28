import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  Menu,
  CreateMenuRequest,
  UpdateMenuRequest,
  CreateMenuSectionRequest,
  UpdateMenuSectionRequest,
  CreateMenuItemRequest,
  UpdateMenuItemRequest,
} from "@mbe/types";
import type { MenuWithSections } from "@mbe/api-client";
import { useApiClient } from "./useApiClient.js";
import { buildQueryKey, createQueryHook } from "./create-query-hook.js";
import { createMutationHook } from "./create-mutation-hook.js";

const MENUS_QUERY_KEY = "menus" as const;
const MENU_QUERY_KEY = "menu" as const;

/* ── Queries ─────────────────────────────────────────── */

export const useMenus = createQueryHook<Menu[], { venueId?: string | null }>({
  key: MENUS_QUERY_KEY,
  fetcher: (params, api) => api.menus.list(params!.venueId!),
  getEnabled: (params) => !!params?.venueId,
});

interface MenuParams {
  venueId?: string | null;
  menuId?: string | null;
}

export const useMenu = createQueryHook<MenuWithSections, MenuParams>({
  key: MENU_QUERY_KEY,
  fetcher: (params, api) => api.menus.getById(params!.venueId!, params!.menuId!),
  getEnabled: (params) => !!params?.venueId && !!params?.menuId,
});

/** The cache key useMenu({ venueId, menuId }) reads from. */
export function menuQueryKey(venueId: string, menuId: string): readonly unknown[] {
  return buildQueryKey<MenuParams>(MENU_QUERY_KEY, { venueId, menuId });
}

/* ── Mutations: every one refreshes the list and the open menu ── */

const invalidateKeys = [MENUS_QUERY_KEY, MENU_QUERY_KEY] as const;

interface MenuTarget {
  venueId: string;
  menuId: string;
}
interface SectionTarget extends MenuTarget {
  sectionId: string;
}
interface ItemTarget extends SectionTarget {
  itemId: string;
}

export const useCreateMenu = createMutationHook<{ venueId: string; data: CreateMenuRequest }, Menu>(
  { invalidateKeys, mutationFn: (api, v) => api.menus.create(v.venueId, v.data) }
);

export const useUpdateMenu = createMutationHook<MenuTarget & { data: UpdateMenuRequest }, Menu>({
  invalidateKeys,
  mutationFn: (api, v) => api.menus.update(v.venueId, v.menuId, v.data),
});

export const useDeleteMenu = createMutationHook<MenuTarget>({
  invalidateKeys,
  mutationFn: (api, v) => api.menus.delete(v.venueId, v.menuId),
});

export const useCreateSection = createMutationHook<MenuTarget & { data: CreateMenuSectionRequest }>(
  {
    invalidateKeys,
    mutationFn: (api, v) => api.menus.createSection(v.venueId, v.menuId, v.data),
  }
);

export const useUpdateSection = createMutationHook<
  SectionTarget & { data: UpdateMenuSectionRequest }
>({
  invalidateKeys,
  mutationFn: (api, v) => api.menus.updateSection(v.venueId, v.menuId, v.sectionId, v.data),
});

export const useDeleteSection = createMutationHook<SectionTarget>({
  invalidateKeys,
  mutationFn: (api, v) => api.menus.deleteSection(v.venueId, v.menuId, v.sectionId),
});

export const useReorderSections = createMutationHook<MenuTarget & { ids: string[] }>({
  invalidateKeys,
  mutationFn: (api, v) => api.menus.reorderSections(v.venueId, v.menuId, v.ids),
});

export const useCreateItem = createMutationHook<SectionTarget & { data: CreateMenuItemRequest }>({
  invalidateKeys,
  mutationFn: (api, v) => api.menus.createItem(v.venueId, v.menuId, v.sectionId, v.data),
});

export const useUpdateItem = createMutationHook<ItemTarget & { data: UpdateMenuItemRequest }>({
  invalidateKeys,
  mutationFn: (api, v) => api.menus.updateItem(v.venueId, v.menuId, v.sectionId, v.itemId, v.data),
});

export const useDeleteItem = createMutationHook<ItemTarget>({
  invalidateKeys,
  mutationFn: (api, v) => api.menus.deleteItem(v.venueId, v.menuId, v.sectionId, v.itemId),
});

export const useReorderItems = createMutationHook<SectionTarget & { ids: string[] }>({
  invalidateKeys,
  mutationFn: (api, v) => api.menus.reorderItems(v.venueId, v.menuId, v.sectionId, v.ids),
});

/* ── One-tap sold-out: optimistic, rolled back on error ─────── */

type SoldOutVariables = ItemTarget & { soldOut: boolean };

function withItemStatus(
  menu: MenuWithSections,
  itemId: string,
  status: "AVAILABLE" | "SOLD_OUT"
): MenuWithSections {
  return {
    ...menu,
    sections: menu.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => (item.id === itemId ? { ...item, status } : item)),
    })),
  };
}

export function useToggleItemSoldOut() {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (v: SoldOutVariables) =>
      api.menus.updateItem(v.venueId, v.menuId, v.sectionId, v.itemId, {
        status: v.soldOut ? "SOLD_OUT" : "AVAILABLE",
      }),
    onMutate: async (v) => {
      const key = menuQueryKey(v.venueId, v.menuId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<MenuWithSections>(key);
      if (previous) {
        queryClient.setQueryData(
          key,
          withItemStatus(previous, v.itemId, v.soldOut ? "SOLD_OUT" : "AVAILABLE")
        );
      }
      return { key, previous };
    },
    onError: (_err, _v, context) => {
      if (context?.previous) queryClient.setQueryData(context.key, context.previous);
    },
    onSettled: (_data, _err, v) => {
      void queryClient.invalidateQueries({ queryKey: menuQueryKey(v.venueId, v.menuId) });
    },
  });
}
