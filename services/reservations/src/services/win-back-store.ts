import type { PrismaClient } from "../generated/prisma/index.js";
import { prisma } from "./database.js";

/**
 * The win-back send record behind `POST /guests/:id/win-back` (#8041). Every
 * function runs through the venue-scoped `prisma`, so the caller is already
 * inside the venue's context (`venueScoped` routes are).
 */

type Db = Pick<PrismaClient, "guestWinBack">;

/** A guest who was sent a win-back is not sent another for this long. */
export const WIN_BACK_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export type WinBackClaim = { claimed: true } | { claimed: false; lastSentAt: Date };

function isUniqueViolation(err: unknown): boolean {
  return err !== null && typeof err === "object" && (err as { code?: unknown }).code === "P2002";
}

/**
 * Claims the guest's next win-back, BEFORE the provider call. Two simultaneous
 * callers cannot both win, with no read-then-write gap:
 *
 * - a guest sent to before: one `UPDATE … WHERE last_sent_at <= cutoff`. The
 *   second caller waits on the row lock, re-evaluates the WHERE against the
 *   first one's new time, and matches nothing.
 * - a guest never sent to: `INSERT`, and `guest_id` is UNIQUE, so the loser gets
 *   P2002 instead of a second row.
 *
 * A claim is not undone if the send then fails (at-most-once; see `sendWinBack`).
 */
export async function claimWinBack(
  venueId: string,
  guestId: string,
  now: Date,
  db: Db = prisma
): Promise<WinBackClaim> {
  const cutoff = new Date(now.getTime() - WIN_BACK_COOLDOWN_MS);
  const renewed = await db.guestWinBack.updateMany({
    where: { venueId, guestId, lastSentAt: { lte: cutoff } },
    data: { lastSentAt: now },
  });
  if (renewed.count === 1) return { claimed: true };
  try {
    await db.guestWinBack.create({ data: { venueId, guestId, lastSentAt: now } });
    return { claimed: true };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }
  const existing = await db.guestWinBack.findFirst({
    where: { venueId, guestId },
    select: { lastSentAt: true },
  });
  // Present: the unique violation proves a row exists. Absent only if it was deleted
  // between the two statements, which nothing does (guest delete cascades, then no send).
  return { claimed: false, lastSentAt: existing?.lastSentAt ?? now };
}

/** When each of these guests was last sent a win-back; guests never sent to are absent. */
export async function lastWinBackSentAt(
  venueId: string,
  guestIds: readonly string[],
  db: Db = prisma
): Promise<Map<string, Date>> {
  if (guestIds.length === 0) return new Map();
  const rows = await db.guestWinBack.findMany({
    where: { venueId, guestId: { in: [...guestIds] } },
    select: { guestId: true, lastSentAt: true },
  });
  return new Map(rows.map((r) => [r.guestId, r.lastSentAt]));
}
