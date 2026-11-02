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
  /** `previousClaimedAt` is what the row held (null = never or released); a release restores it. */
  | { claimed: true; previousClaimedAt: Date | null }
  | { claimed: false; claimedAt: Date | null; sentAt: Date | null };

function isUniqueViolation(err: unknown): boolean {
  return err !== null && typeof err === "object" && (err as { code?: unknown }).code === "P2002";
}

async function refusal(venueId: string, guestId: string, now: Date, db: Db): Promise<WinBackClaim> {
  const existing = await db.guestWinBack.findFirst({
    where: { venueId, guestId },
    select: { claimedAt: true, sentAt: true },
  });
  // Present: a refusal is only reached once a row exists. Absent only if it was deleted
  // in between, which nothing does (guest delete cascades, then no send).
  return {
    claimed: false,
    claimedAt: existing?.claimedAt ?? now,
    sentAt: existing?.sentAt ?? null,
  };
}

/**
 * Claims the guest's next win-back, BEFORE the provider call. Two simultaneous
 * callers cannot both win, and the write is always conditional, never a blind
 * read-then-write:
 *
 * - a guest with a row that is eligible (never claimed, released, or claimed over a
 *   cooldown ago): one `UPDATE … WHERE claimed_at = <the value just read>`. The second
 *   caller waits on the row lock, re-evaluates the WHERE against the first one's new
 *   time, and matches nothing. The value read is returned as `previousClaimedAt`, so a
 *   rejected send can put it back instead of erasing an older unconfirmed attempt.
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
  const existing = await db.guestWinBack.findFirst({
    where: { venueId, guestId },
    select: { claimedAt: true },
  });
  if (existing) {
    const previousClaimedAt = existing.claimedAt;
    if (previousClaimedAt !== null && previousClaimedAt.getTime() > cutoff.getTime()) {
      return refusal(venueId, guestId, now, db);
    }
    const renewed = await db.guestWinBack.updateMany({
      where: { venueId, guestId, claimedAt: previousClaimedAt },
      data: { claimedAt: now },
    });
    return renewed.count === 1
      ? { claimed: true, previousClaimedAt }
      : refusal(venueId, guestId, now, db);
  }
  try {
    await db.guestWinBack.create({ data: { venueId, guestId, claimedAt: now } });
    return { claimed: true, previousClaimedAt: null };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return refusal(venueId, guestId, now, db);
  }
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
 * Releases the claim made at `claimedAt` after the provider definitely rejected (or could not
 * take) the send, so a retry can claim at once. It puts `previousClaimedAt` back rather than
 * clearing: an older attempt that ended ambiguously must stay visible. Conditional on the
 * claim time, so it cannot clear a newer claim.
 */
export async function releaseWinBackClaim(
  venueId: string,
  guestId: string,
  claimedAt: Date,
  previousClaimedAt: Date | null,
  db: Db = prisma
): Promise<void> {
  await db.guestWinBack.updateMany({
    where: { venueId, guestId, claimedAt },
    data: { claimedAt: previousClaimedAt },
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
