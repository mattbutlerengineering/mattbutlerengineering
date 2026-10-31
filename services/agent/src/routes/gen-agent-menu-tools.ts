import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import type { FastifyBaseLogger } from "fastify";
import { NO_VENUE, refusalOf, type ApiClient } from "./gen-tool-support.js";

/**
 * Chat tools for menus (#7928): read them, mark an item sold out or available,
 * change an item's price, name or description. Menus and items are named the way
 * staff say them, never by id; each write runs only after the user confirms.
 * Creating, deleting and reordering stay on the Menus page.
 */

const CENTS_PER_UNIT = 100;
const PRICE = /^\d+$|^\d+\.\d\d?$/;

type Menu = Awaited<ReturnType<ApiClient["menus"]["list"]>>[number];
type MenuDetail = Awaited<ReturnType<ApiClient["menus"]["getById"]>>;
type MenuSection = MenuDetail["sections"][number];
type MenuItem = MenuSection["items"][number];

const sameName = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/** "14.50" from 1450: the price as staff read it. */
function formatPrice(cents: number): string {
  return (cents / CENTS_PER_UNIT).toFixed(2);
}

/** 1610 from "16.1", by digits so no floating-point rounding can reach a price. */
function priceToCents(price: string): number {
  const [whole = "0", fraction = ""] = price.split(".");
  return Number(whole) * CENTS_PER_UNIT + Number(fraction.padEnd(2, "0"));
}

const ItemSchema = {
  menu: z.string().min(1).describe("The menu's name, as list_menus or get_menu gives it"),
  item: z.string().min(1).describe("The item's name, as it is on the menu"),
  section: z
    .string()
    .min(1)
    .optional()
    .describe("Only when two items on the menu share the name: the item's section"),
};

/** A refused or failed menu write, in words the model can pass on. */
function menuFailure(err: unknown) {
  const refusal = refusalOf(err);
  if (!refusal) {
    return {
      error: "Couldn't change the menu right now. Nothing was changed. Ask the user to try again.",
    };
  }
  if (refusal.status === 403) {
    return {
      refused: true,
      error: "The user doesn't have permission to do this. Nothing was changed.",
    };
  }
  return { refused: true, error: `${refusal.detail} Nothing was changed.` };
}

/** One menu by name (case-insensitive) or by the id of the menu the page has open. */
function findMenu(menus: readonly Menu[], ref: string): { menu: Menu } | { error: string } {
  const matches = menus.filter((m) => m.id === ref || sameName(m.name, ref));
  if (matches.length === 1) return { menu: matches[0]! };
  const names = menus.map((m) => m.name).join(", ");
  return matches.length === 0
    ? { error: `No menu called ${ref}. The menus are: ${names || "none yet"}.` }
    : { error: `${matches.length} menus are called ${ref}. Rename one on the Menus page first.` };
}

/** One item by name, narrowed by section when given. Two matches is a question, never a guess. */
function findItem(
  menu: MenuDetail,
  itemRef: string,
  sectionRef: string | undefined
): { section: MenuSection; item: MenuItem } | { error: string } {
  const matches = menu.sections
    .filter((s) => sectionRef === undefined || sameName(s.name, sectionRef))
    .flatMap((section) =>
      section.items.filter((i) => sameName(i.name, itemRef)).map((item) => ({ section, item }))
    );
  if (matches.length === 1) return matches[0]!;
  if (matches.length === 0) {
    const where = sectionRef ? `the ${sectionRef} section of ${menu.name}` : menu.name;
    return { error: `No item called ${itemRef} on ${where}.` };
  }
  const sections = matches.map((m) => m.section.name).join(" and ");
  return {
    error: `${matches.length} items on ${menu.name} are called ${itemRef} (in ${sections}). Ask which section.`,
  };
}

/** The menu and item a write names, or the question to put back to the user. */
async function resolveTarget(
  api: ApiClient,
  venueId: string,
  menuRef: string,
  itemRef: string,
  sectionRef: string | undefined
) {
  const found = findMenu(await api.menus.list(venueId), menuRef);
  if ("error" in found) return found;
  const detail = await api.menus.getById(venueId, found.menu.id);
  const target = findItem(detail, itemRef, sectionRef);
  return "error" in target ? target : { menuId: found.menu.id, ...target };
}

export function createMenuTools(
  log: FastifyBaseLogger,
  api: ApiClient,
  { venueId }: { readonly venueId?: string | undefined }
): ToolSet {
  return {
    // ── Read ───────────────────────────────────────────────
    list_menus: tool({
      description: "List the venue's menus: name, status (DRAFT, ACTIVE, INACTIVE), description.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId }, "list_menus tool called");
        try {
          const menus = await api.menus.list(venueId);
          return {
            menus: menus.map((m) => ({
              name: m.name,
              status: m.status,
              description: m.description,
            })),
          };
        } catch (err) {
          log.error({ err, venueId }, "list_menus failed");
          return readFailure(err);
        }
      },
    }),

    get_menu: tool({
      description:
        "Show one menu's sections and items: each item's name, price, description and status (AVAILABLE, SOLD_OUT, HIDDEN).",
      inputSchema: z.object({
        menu: z
          .string()
          .min(1)
          .describe("The menu's name, or the id of the menu the page has open"),
      }),
      execute: async ({ menu: menuRef }) => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId }, "get_menu tool called");
        try {
          const found = findMenu(await api.menus.list(venueId), menuRef);
          if ("error" in found) return found;
          const detail = await api.menus.getById(venueId, found.menu.id);
          return {
            menu: detail.name,
            status: detail.status,
            sections: detail.sections.map((s) => ({
              name: s.name,
              items: s.items.map((i) => ({
                name: i.name,
                price: formatPrice(i.priceCents),
                status: i.status,
                description: i.description,
              })),
            })),
          };
        } catch (err) {
          log.error({ err, venueId }, "get_menu failed");
          return readFailure(err);
        }
      },
    }),

    // ── Write (each runs only after the user confirms) ─────
    set_menu_item_availability: tool({
      description: "Mark a menu item sold out, or available again. Requires confirmation.",
      inputSchema: z.object({
        ...ItemSchema,
        availability: z.enum(["sold_out", "available"]).describe("The item's new state"),
      }),
      execute: async ({ menu, item, section, availability }) => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId, availability }, "set_menu_item_availability tool called");
        try {
          const target = await resolveTarget(api, venueId, menu, item, section);
          if ("error" in target) return target;
          // Either state would show guests an item staff chose to hide.
          if (target.item.status === "HIDDEN") {
            return {
              error: `${target.item.name} is hidden from guests. Nothing was changed. Point the user to the Menus page to show it.`,
            };
          }
          const status = availability === "sold_out" ? "SOLD_OUT" : "AVAILABLE";
          await api.menus.updateItem(venueId, target.menuId, target.section.id, target.item.id, {
            status,
          });
          return { updated: true, item: target.item.name, status };
        } catch (err) {
          log.error({ err, venueId }, "set_menu_item_availability failed");
          return menuFailure(err);
        }
      },
    }),

    update_menu_item: tool({
      description: "Change a menu item's price, name or description. Requires confirmation.",
      inputSchema: z
        .object({
          ...ItemSchema,
          price: z
            .string()
            .regex(PRICE)
            .optional()
            .describe('The new price as plain digits with up to two decimals, like "16.50"'),
          name: z.string().min(1).optional().describe("The item's new name"),
          description: z.string().min(1).optional().describe("The item's new description"),
        })
        .refine(
          (v) => v.price !== undefined || v.name !== undefined || v.description !== undefined,
          {
            message: "Give a new price, name or description.",
          }
        ),
      execute: async ({ menu, item, section, price, name, description }) => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId }, "update_menu_item tool called");
        try {
          const target = await resolveTarget(api, venueId, menu, item, section);
          if ("error" in target) return target;
          await api.menus.updateItem(venueId, target.menuId, target.section.id, target.item.id, {
            ...(price !== undefined ? { priceCents: priceToCents(price) } : {}),
            ...(name !== undefined ? { name } : {}),
            ...(description !== undefined ? { description } : {}),
          });
          return { updated: true, item: name ?? target.item.name };
        } catch (err) {
          log.error({ err, venueId }, "update_menu_item failed");
          return menuFailure(err);
        }
      },
    }),
  };
}

/** A failed menu read, in words the model can pass on. */
function readFailure(err: unknown) {
  return refusalOf(err)?.status === 403
    ? { refused: true, error: "The user doesn't have permission to see menus." }
    : { error: "Couldn't read the menus. Ask the user to try again." };
}
