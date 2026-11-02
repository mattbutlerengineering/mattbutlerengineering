import type { PrismaClient } from "../generated/prisma/index.js";
import { prisma } from "./database.js";

/**
 * The win-back send record behind `POST /guests/:id/win-back` (#8041). Every
 * function runs through the venue-scoped `prisma`, so the caller is already
 * inside the venue's context (`venueScoped` routes are).
 *
 * Two times per guest, with different meanings:
 * - `claimedAt`: a send was claimed, BEFORE the provider call. Null once a
 *   definite provider rejection released it.
 * - `sentAt`: the provider call returned success. Only this proves an email went.
 * A claim newer than `sentAt` is an unconfirmed attempt.
 */

type Db = Pick<PrismaClient, "guestWinBack">;

/** A guest whose send was claimed is not claimed again for this long. */
export const WIN_BACK_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export type WinBackClaim =
  { claimed: true } | { claimed: false; claimedAt: Date | null; sentAt: Date | null };

function isUniqueViolation(err: unknown): boolean {
  return err !== null && typeof err === "object" && (err as { code?: unknown }).code === "P2002";
}

/**
 * Claims the guest's next win-back, BEFORE the provider call. Two simultaneous
 * callers cannot both win, with no read-then-write gap:
 *
 * - a guest with a row: one `UPDATE … WHERE claimed_at IS NULL OR claimed_at <= cutoff`.
 *   The second caller waits on the row lock, re-evaluates the WHERE against the
 *   first one's new time, and matches nothing.
 * - a guest never sent to: `INSERT`, and `guest_id` is UNIQUE, so the loser gets
 *   P2002 instead of a second row.
 */
export async function claimWinBack(
  venueId: string,
  guestId: string,
  now: Date,
  db: Db = prisma
): Promise<WinBackClaim> {
  const cutoff = new Date(now.getTime() - WIN_BACK_COOLDOWN_MS);
  const renewed = await db.guestWinBack.updateMany({
    where: { venueId, guestId, OR: [{ claimedAt: null }, { claimedAt: { lte: cutoff } }] },
    data: { claimedAt: now },
  });
  if (renewed.count === 1) return { claimed: true };
  try {
    await db.guestWinBack.create({ data: { venueId, guestId, claimedAt: now } });
    return { claimed: true };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }
  const existing = await db.guestWinBack.findFirst({
    where: { venueId, guestId },
    select: { claimedAt: true, sentAt: true },
  });
  // Present: the unique violation proves a row exists. Absent only if it was deleted
  // between the two statements, which nothing does (guest delete cascades, then no send).
  return {
    claimed: false,
    claimedAt: existing?.claimedAt ?? now,
    sentAt: existing?.sentAt ?? null,
  };
}

/** Records that the provider accepted the send claimed at `claimedAt`; a newer claim is left alone. */
export async function markWinBackSent(
  venueId: string,
  guestId: string,
  claimedAt: Date,
  sentAt: Date,
  db: Db = prisma
): Promise<void> {
  await db.guestWinBack.updateMany({
    where: { venueId, guestId, claimedAt },
    data: { sentAt },
  });
}

/**
 * Releases the claim made at `claimedAt` after the provider definitely rejected the send, so
 * a retry can claim at once. Conditional on the claim time: it cannot clear a newer claim.
 */
export async function releaseWinBackClaim(
  venueId: string,
  guestId: string,
  claimedAt: Date,
  db: Db = prisma
): Promise<void> {
  await db.guestWinBack.updateMany({
    where: { venueId, guestId, claimedAt },
    data: { claimedAt: null },
  });
}

export interface WinBackStatus {
  /** When the provider last accepted a send; null = never confirmed. */
  sentAt: Date | null;
  /** When a claim newer than `sentAt` was made (send unconfirmed); null = none outstanding. */
  attemptedAt: Date | null;
}

/** True when the claim has no confirmed send at or after it. */
export function isUnconfirmed(claimedAt: Date | null, sentAt: Date | null): claimedAt is Date {
  return claimedAt !== null && (sentAt === null || sentAt.getTime() < claimedAt.getTime());
}

/** Each of these guests' win-back status; guests with no record are absent. */
export async function winBackStatusFor(
  venueId: string,
  guestIds: readonly string[],
  db: Db = prisma
): Promise<Map<string, WinBackStatus>> {
  if (guestIds.length === 0) return new Map();
  const rows = await db.guestWinBack.findMany({
    where: { venueId, guestId: { in: [...guestIds] } },
    select: { guestId: true, claimedAt: true, sentAt: true },
  });
  return new Map(
    rows.map((r) => [
      r.guestId,
      {
        sentAt: r.sentAt,
        attemptedAt: isUnconfirmed(r.claimedAt, r.sentAt) ? r.claimedAt : null,
      },
    ])
  );
}
