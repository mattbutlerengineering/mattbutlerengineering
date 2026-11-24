import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import type { FastifyBaseLogger } from "fastify";
import { findMenu, sameName } from "./gen-agent-menu-tools.js";
import {
  NO_VENUE,
  notExecuted,
  saveUnsure,
  writeFailure,
  type ApiClient,
} from "./gen-tool-support.js";

/**
 * Chat tools that change a menu's structure (#9478): create a menu, and put
 * a menu's sections or a section's items in a new order. Each write runs only
 * after the user confirms. Deleting stays on the Menus page.
 */

const MENU_SAVE_UNSURE = saveUnsure("get_menu");

/** "late-night-bar-bites" from "Late Night & Bar Bites"; empty when no letter or digit is left. */
function slugOf(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface Named {
  readonly id: string;
  readonly name: string;
}

/**
 * The ids of `rows` in the order `names` lists them. Every row must be named
 * exactly once, so a reorder can never drop or duplicate one.
 */
function orderByNames(
  rows: readonly Named[],
  names: readonly string[],
  what: string,
  where: string
): { ids: string[]; order: string[] } | { error: string } {
  const picked: Named[] = [];
  for (const name of names) {
    const matches = rows.filter((r) => sameName(r.name, name));
    if (matches.length === 0) {
      return { error: `No ${what} called ${name} on ${where}. Nothing was changed.` };
    }
    if (matches.length > 1) {
      return {
        error: `${matches.length} ${what}s on ${where} are called ${name}. Rename one on the Menus page first.`,
      };
    }
    if (picked.includes(matches[0]!)) {
      return { error: `${name} is listed twice. Nothing was changed.` };
    }
    picked.push(matches[0]!);
  }
  const left = rows.filter((r) => !picked.includes(r)).map((r) => r.name);
  if (left.length > 0) {
    return {
      error: `The new order leaves out ${left.join(", ")}. Name every ${what} on ${where}, in the order wanted. Nothing was changed.`,
    };
  }
  return { ids: picked.map((r) => r.id), order: picked.map((r) => r.name) };
}

export function createMenuStructureTools(
  log: FastifyBaseLogger,
  api: ApiClient,
  { venueId }: { readonly venueId?: string | undefined }
): ToolSet {
  return {
    create_menu: tool({
      description:
        "Create a new menu, saved as a draft so guests don't see it until it is published on the Menus page. Requires confirmation.",
      inputSchema: z.object({
        name: z.string().min(1).describe("The new menu's name"),
        description: z.string().min(1).optional().describe("A short description of the menu"),
      }),
      execute: async ({ name, description }) => {
        if (!venueId) return notExecuted(NO_VENUE);
        log.info({ venueId }, "create_menu tool called");
        let unsure: string | undefined;
        try {
          const slug = slugOf(name);
          if (slug === "") {
            return notExecuted({ error: "A menu name needs letters or digits in it." });
          }
          const menus = await api.menus.list(venueId);
          if (menus.some((m) => sameName(m.name, name) || m.slug === slug)) {
            return notExecuted({
              error: `A menu called ${name} already exists. Nothing was changed.`,
            });
          }
          unsure = MENU_SAVE_UNSURE;
          await api.menus.create(venueId, {
            name,
            slug,
            ...(description !== undefined ? { description } : {}),
            status: "DRAFT",
          });
          return { created: true, menu: name, status: "DRAFT" };
        } catch (err) {
          log.error({ err, venueId }, "create_menu failed");
          return writeFailure(err, { action: "create the menu", unsure });
        }
      },
    }),

    reorder_menu_sections: tool({
      description:
        "Put a menu's sections in a new order, as guests see them. Name every section, first to last. Requires confirmation.",
      inputSchema: z.object({
        menu: z.string().min(1).describe("The menu's name, as list_menus or get_menu gives it"),
        sections: z
          .array(z.string().min(1))
          .min(1)
          .describe("Every section's name, in the new order"),
      }),
      execute: async ({ menu: menuRef, sections }) => {
        if (!venueId) return notExecuted(NO_VENUE);
        log.info({ venueId }, "reorder_menu_sections tool called");
        let unsure: string | undefined;
        try {
          const found = findMenu(await api.menus.list(venueId), menuRef);
          if ("error" in found) return notExecuted(found);
          const detail = await api.menus.getById(venueId, found.menu.id);
          const ordered = orderByNames(detail.sections, sections, "section", detail.name);
          if ("error" in ordered) return notExecuted(ordered);
          unsure = MENU_SAVE_UNSURE;
          await api.menus.reorderSections(venueId, found.menu.id, ordered.ids);
          return { reordered: true, menu: detail.name, order: ordered.order };
        } catch (err) {
          log.error({ err, venueId }, "reorder_menu_sections failed");
          return writeFailure(err, { action: "reorder the menu", unsure });
        }
      },
    }),

    reorder_menu_items: tool({
      description:
        "Put one section's items in a new order, as guests see them. Name every item in the section, first to last. Requires confirmation.",
      inputSchema: z.object({
        menu: z.string().min(1).describe("The menu's name, as list_menus or get_menu gives it"),
        section: z.string().min(1).describe("The section's name"),
        items: z.array(z.string().min(1)).min(1).describe("Every item's name, in the new order"),
      }),
      execute: async ({ menu: menuRef, section: sectionRef, items }) => {
        if (!venueId) return notExecuted(NO_VENUE);
        log.info({ venueId }, "reorder_menu_items tool called");
        let unsure: string | undefined;
        try {
          const found = findMenu(await api.menus.list(venueId), menuRef);
          if ("error" in found) return notExecuted(found);
          const detail = await api.menus.getById(venueId, found.menu.id);
          const sections = detail.sections.filter((s) => sameName(s.name, sectionRef));
          if (sections.length !== 1) {
            const names = detail.sections.map((s) => s.name).join(", ");
            return notExecuted({
              error:
                sections.length === 0
                  ? `No section called ${sectionRef} on ${detail.name}. The sections are: ${names || "none yet"}.`
                  : `${sections.length} sections on ${detail.name} are called ${sectionRef}. Rename one on the Menus page first.`,
            });
          }
          const section = sections[0]!;
          const ordered = orderByNames(section.items, items, "item", `the ${section.name} section`);
          if ("error" in ordered) return notExecuted(ordered);
          unsure = MENU_SAVE_UNSURE;
          await api.menus.reorderItems(venueId, found.menu.id, section.id, ordered.ids);
          return {
            reordered: true,
            menu: detail.name,
            section: section.name,
            order: ordered.order,
          };
        } catch (err) {
          log.error({ err, venueId }, "reorder_menu_items failed");
          return writeFailure(err, { action: "reorder the section", unsure });
        }
      },
    }),
  };
}
