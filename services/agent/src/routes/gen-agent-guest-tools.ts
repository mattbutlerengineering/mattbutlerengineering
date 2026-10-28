import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import type { FastifyBaseLogger } from "fastify";
import { NO_VENUE, refusalOf, type ApiClient } from "./gen-tool-support.js";

/**
 * Chat tools for the guest directory (#7927): add a guest, update tags, dietary
 * restrictions and contact details, add a staff note, and win back lapsing
 * guests. Guests are named the way staff say them; contact details are input
 * only and never read back into the chat.
 */

type Guest = Awaited<ReturnType<ApiClient["guests"]["get"]>>;

const GuestRefSchema = {
  guest: z.string().min(1).describe("The guest's name, as on their profile"),
  contact: z
    .string()
    .min(1)
    .optional()
    .describe("Only when two guests share the name: this guest's phone or email"),
};

/** A guest as the chat may show it: never their email or phone. */
function shown(guest: Guest) {
  return {
    name: guest.name,
    visitCount: guest.visitCount,
    tags: guest.tags ?? [],
    dietaryRestrictions: guest.dietaryRestrictions ?? [],
  };
}

/** A refused or failed guest write, in words the model can pass on. */
function guestFailure(err: unknown, action: string) {
  const refusal = refusalOf(err);
  if (!refusal) {
    return {
      error: `Couldn't ${action} right now. Nothing was changed. Ask the user to try again.`,
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

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The one guest called `name` at the venue, told apart by `contact` (phone or email)
 * when two share it. Never a guess, and never a new guest.
 */
async function findGuest(
  api: ApiClient,
  venueId: string,
  name: string,
  contact: string | undefined
): Promise<{ guest: Guest } | { error: string }> {
  const { data } = await api.guests.search({ venueId, query: name });
  const named = data.filter((g) => sameText(g.name, name));
  const matches = contact
    ? named.filter((g) => [g.email, g.phone].some((c) => c && sameText(c, contact)))
    : named;
  if (matches.length === 1) return { guest: matches[0]! };
  if (matches.length === 0) {
    return {
      error: `No guest called ${name}${contact ? ` with that phone or email` : ""} was found.`,
    };
  }
  return {
    error: `${matches.length} guests are called ${name}. Ask for this guest's phone or email to tell them apart.`,
  };
}

const UpdateGuestInputSchema = z
  .object({
    ...GuestRefSchema,
    name: z.string().min(1).optional().describe("A corrected name"),
    phone: z.string().min(1).optional().describe("A new phone number"),
    email: z.email().optional().describe("A new email address"),
    addTags: z.array(z.string().min(1)).min(1).optional().describe("Tags to add"),
    removeTags: z.array(z.string().min(1)).min(1).optional().describe("Tags to remove"),
    dietaryRestrictions: z
      .array(z.string().min(1))
      .optional()
      .describe("The guest's full list of dietary restrictions (replaces the current list)"),
  })
  .refine(
    (input) =>
      [
        input.name,
        input.phone,
        input.email,
        input.addTags,
        input.removeTags,
        input.dietaryRestrictions,
      ].some((v) => v !== undefined),
    { message: "Say what to change: a name, phone, email, tags or dietary restrictions" }
  );

export function createGuestTools(
  log: FastifyBaseLogger,
  api: ApiClient,
  { venueId }: { readonly venueId?: string | undefined }
): ToolSet {
  return {
    // ── Read ───────────────────────────────────────────────
    list_lapsing_guests: tool({
      description:
        "List regular guests who are overdue for a visit (win-back candidates), most overdue first.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId }, "list_lapsing_guests tool called");
        try {
          const lapsing = await api.guests.getLapsing(venueId);
          return {
            guests: [...lapsing]
              .sort((a, b) => b.daysOverdue - a.daysOverdue)
              .map((g) => ({
                name: g.name,
                daysSinceLastVisit: g.daysSinceLastVisit,
                daysOverdue: g.daysOverdue,
              })),
          };
        } catch (err) {
          log.error({ err, venueId }, "list_lapsing_guests failed");
          return { error: "Couldn't read lapsing guests. Ask the user to try again." };
        }
      },
    }),

    // ── Write (each runs only after the user confirms) ─────
    add_guest: tool({
      description:
        "Add a guest to the directory. An existing guest with the same email or phone is reused, not duplicated. Requires confirmation.",
      inputSchema: z.object({
        name: z.string().min(1).describe("The guest's name"),
        phone: z.string().min(1).optional().describe("The guest's phone number"),
        email: z.email().optional().describe("The guest's email address"),
        dietaryRestrictions: z
          .array(z.string().min(1))
          .optional()
          .describe("Dietary restrictions, when the user gives them"),
      }),
      execute: async ({ name, phone, email, dietaryRestrictions }) => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId }, "add_guest tool called");
        try {
          const saved = await api.guests.findOrCreate({
            venueId,
            name,
            ...(phone ? { phone } : {}),
            ...(email ? { email } : {}),
            ...(dietaryRestrictions ? { dietaryRestrictions } : {}),
          });
          return { saved: true, guest: shown(saved) };
        } catch (err) {
          log.error({ err, venueId }, "add_guest failed");
          return guestFailure(err, "add the guest");
        }
      },
    }),

    update_guest: tool({
      description:
        "Update a guest's profile: correct their name, phone or email, add or remove tags, or replace their dietary restrictions. Requires confirmation.",
      inputSchema: UpdateGuestInputSchema,
      execute: async (input) => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId }, "update_guest tool called");
        try {
          const found = await findGuest(api, venueId, input.guest, input.contact);
          if ("error" in found) return found;
          const current = found.guest.tags ?? [];
          const tagsChange = input.addTags || input.removeTags;
          const tags = tagsChange
            ? [
                ...current.filter((tag) => !(input.removeTags ?? []).some((r) => sameText(r, tag))),
                ...(input.addTags ?? []).filter((tag) => !current.some((c) => sameText(c, tag))),
              ]
            : undefined;
          const updated = await api.guests.update(found.guest.id, {
            ...(input.name ? { name: input.name } : {}),
            ...(input.phone ? { phone: input.phone } : {}),
            ...(input.email ? { email: input.email } : {}),
            ...(tags ? { tags } : {}),
            ...(input.dietaryRestrictions
              ? { dietaryRestrictions: input.dietaryRestrictions }
              : {}),
          });
          return { updated: true, guest: shown(updated) };
        } catch (err) {
          log.error({ err, venueId }, "update_guest failed");
          return guestFailure(err, "update the guest");
        }
      },
    }),

    add_guest_note: tool({
      description:
        "Add a staff note to a guest's profile (seen by staff only). Requires confirmation.",
      inputSchema: z.object({
        ...GuestRefSchema,
        text: z.string().min(1).max(1000).describe("The note"),
      }),
      execute: async ({ guest, contact, text }) => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId }, "add_guest_note tool called");
        try {
          const found = await findGuest(api, venueId, guest, contact);
          if ("error" in found) return found;
          await api.guests.addNote(found.guest.id, text);
          return { noted: true, guest: found.guest.name };
        } catch (err) {
          log.error({ err, venueId }, "add_guest_note failed");
          return guestFailure(err, "add the note");
        }
      },
    }),

    send_win_back: tool({
      description:
        "Send a lapsing guest the venue's win-back message, inviting them back. Only guests from list_lapsing_guests. Requires confirmation.",
      inputSchema: z.object({
        guest: z.string().min(1).describe("The lapsing guest's name, as listed"),
      }),
      execute: async ({ guest }) => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId }, "send_win_back tool called");
        try {
          const lapsing = await api.guests.getLapsing(venueId);
          const matches = lapsing.filter((g) => sameText(g.name, guest));
          if (matches.length !== 1) {
            return {
              error:
                matches.length === 0
                  ? `${guest} isn't on the lapsing guest list, so no win-back was sent.`
                  : `More than one lapsing guest is called ${guest}. Send it from the Dashboard instead.`,
            };
          }
          const { sent } = await api.guests.sendWinBack(matches[0]!.guestId);
          return sent
            ? { sent: true, guest: matches[0]!.name }
            : {
                sent: false,
                guest: matches[0]!.name,
                note: "The message wasn't sent, usually because of the guest's contact preferences. Say so.",
              };
        } catch (err) {
          log.error({ err, venueId }, "send_win_back failed");
          return guestFailure(err, "send the win-back message");
        }
      },
    }),
  };
}
