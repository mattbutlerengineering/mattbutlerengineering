import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import type { FastifyBaseLogger } from "fastify";
import { NO_VENUE, refusalOf, saveUnsure, type ApiClient } from "./gen-tool-support.js";

/**
 * Chat tools for floor plans (#7930): read the venue's plans, and switch which
 * one is active. Plans are named the way staff say them, never by id; the switch
 * runs only after the user confirms. Layout editing stays in the floor plan editor.
 */

const PLAN_PAGE_SIZE = 100;

type FloorPlan = Awaited<ReturnType<ApiClient["floorPlans"]["list"]>>["data"][number];

const sameName = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/** One plan by name (case-insensitive). Two matches is a question, never a guess. */
function findPlan(
  plans: readonly FloorPlan[],
  ref: string
): { plan: FloorPlan } | { error: string } {
  const matches = plans.filter((p) => sameName(p.name, ref));
  if (matches.length === 1) return { plan: matches[0]! };
  if (matches.length === 0) {
    const names = plans.map((p) => p.name).join(", ");
    return { error: `No floor plan called ${ref}. The floor plans are: ${names || "none yet"}.` };
  }
  return {
    error: `${matches.length} floor plans are called ${ref}. Ask the user which one, and rename one in the floor plan editor first.`,
  };
}

/** A failed floor plan read, in words the model can pass on. */
function readFailure(err: unknown) {
  return refusalOf(err)?.status === 403
    ? { refused: true, error: "The user doesn't have permission to see floor plans." }
    : { error: "Couldn't read the floor plans. Ask the user to try again." };
}

/**
 * A refused or failed floor plan write, in words the model can pass on. `unsure` is
 * set once the write is on its way: until then a failure can't have changed anything.
 */
function writeFailure(err: unknown, unsure: string | undefined) {
  const refusal = refusalOf(err);
  if (!refusal) {
    return {
      error:
        unsure ??
        "Couldn't change the floor plan right now. Nothing was changed. Ask the user to try again.",
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

export function createFloorPlanTools(
  log: FastifyBaseLogger,
  api: ApiClient,
  { venueId }: { readonly venueId?: string | undefined }
): ToolSet {
  return {
    // ── Read ───────────────────────────────────────────────
    list_floor_plans: tool({
      description:
        "List the venue's floor plans: name, whether it is the active one, and its table count and total seats.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId }, "list_floor_plans tool called");
        try {
          const { data } = await api.floorPlans.list({ venueId, limit: PLAN_PAGE_SIZE });
          return {
            active: data.find((p) => p.isActive)?.name ?? null,
            floorPlans: data.map((p) => ({
              name: p.name,
              active: p.isActive,
              tables: p.tables?.length ?? 0,
              capacity: (p.tables ?? []).reduce((sum, t) => sum + t.capacity, 0),
            })),
          };
        } catch (err) {
          log.error({ err, venueId }, "list_floor_plans failed");
          return readFailure(err);
        }
      },
    }),

    // ── Write (runs only after the user confirms) ──────────
    activate_floor_plan: tool({
      description:
        "Make a floor plan the venue's active one, by its name. Requires confirmation. This does not edit the layout.",
      inputSchema: z.object({
        floorPlan: z
          .string()
          .min(1)
          .describe("The floor plan's name, as list_floor_plans gives it"),
      }),
      execute: async ({ floorPlan }) => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId }, "activate_floor_plan tool called");
        let unsure: string | undefined;
        try {
          const { data } = await api.floorPlans.list({ venueId, limit: PLAN_PAGE_SIZE });
          const found = findPlan(data, floorPlan);
          if ("error" in found) return found;
          if (found.plan.isActive) {
            return { alreadyActive: true, floorPlan: found.plan.name };
          }
          unsure = saveUnsure("list_floor_plans");
          await api.floorPlans.setActive(found.plan.id);
          return { updated: true, floorPlan: found.plan.name };
        } catch (err) {
          log.error({ err, venueId }, "activate_floor_plan failed");
          return writeFailure(err, unsure);
        }
      },
    }),
  };
}
