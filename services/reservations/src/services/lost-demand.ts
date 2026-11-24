import { createHmac, randomBytes } from "node:crypto";
import { prisma } from "./database.js";

/**
 * Lost Demand Ledger recording (#9484): counts each public availability search
 * that found no slot, keyed by venue, date, requested minute and party size.
 *
 * Privacy: the ledger stores COUNTS ONLY. De-duplication and bot limiting need to
 * tell guests apart, so they use an HMAC of the session id (or ip + user agent)
 * under a random per-process salt. That hash lives only in this process's memory
 * with a TTL; it is never persisted, logged or returned, and a restart discards it.
 */

/** `requestedMinute` for a search that named no time: the whole day had no slot. */
export const ANY_TIME_MINUTE = -1;

/** One guest repeating the same search inside this window counts once. */
const DEDUPE_TTL_MS = 30 * 60 * 1000;
/** A client may add at most this many distinct no-slot searches per window; more is bot-like. */
const RATE_LIMIT_MAX_DISTINCT = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
/** Hard cap on in-memory entries; at the cap we stop counting rather than grow. */
const MAX_TRACKED_ENTRIES = 50_000;

export interface NoSlotSearchKey {
  venueId: string;
  /** YYYY-MM-DD */
  date: string;
  requestedMinute: number;
  partySize: number;
}

/** Request signals used only to derive an in-memory hash; never stored. */
export interface ClientSignals {
  sessionId?: string;
  ip: string;
  userAgent?: string;
}

export interface NoSlotSearchStore {
  increment(key: NoSlotSearchKey): Promise<void>;
}

export type RecordOutcome = "recorded" | "duplicate" | "rate-limited" | "failed";

export interface LostDemandLogger {
  warn: (obj: object, msg: string) => void;
}

interface LostDemandDeps {
  store: NoSlotSearchStore;
  now?: () => number;
  salt?: Buffer;
  logger?: LostDemandLogger;
}

interface RateWindow {
  windowStart: number;
  distinct: number;
}

function pruneExpired(
  seen: Map<string, number>,
  windows: Map<string, RateWindow>,
  now: number
): void {
  for (const [key, expiresAt] of seen) if (expiresAt <= now) seen.delete(key);
  for (const [key, win] of windows) {
    if (now - win.windowStart >= RATE_LIMIT_WINDOW_MS) windows.delete(key);
  }
}

export function createLostDemandService(deps: LostDemandDeps) {
  const { store, logger } = deps;
  const now = deps.now ?? Date.now;
  const salt = deps.salt ?? randomBytes(32);
  const seen = new Map<string, number>();
  const windows = new Map<string, RateWindow>();

  const hash = (...parts: string[]): string =>
    createHmac("sha256", salt).update(parts.join("\u0000")).digest("hex");

  function clientHash(client: ClientSignals): string {
    return client.sessionId
      ? hash("session", client.sessionId)
      : hash("anon", client.ip, client.userAgent ?? "");
  }

  /** True when this client may add another distinct search; bumps its window. */
  function admit(client: string, at: number): boolean {
    const current = windows.get(client);
    const win =
      current && at - current.windowStart < RATE_LIMIT_WINDOW_MS
        ? current
        : { windowStart: at, distinct: 0 };
    if (win.distinct >= RATE_LIMIT_MAX_DISTINCT) {
      windows.set(client, win);
      return false;
    }
    windows.set(client, { ...win, distinct: win.distinct + 1 });
    return true;
  }

  async function recordNoSlotSearch(
    search: NoSlotSearchKey,
    signals: ClientSignals,
    log: LostDemandLogger | undefined = logger
  ): Promise<RecordOutcome> {
    try {
      const at = now();
      if (seen.size + windows.size >= MAX_TRACKED_ENTRIES) pruneExpired(seen, windows, at);
      if (seen.size + windows.size >= MAX_TRACKED_ENTRIES) return "rate-limited";

      const client = clientHash(signals);
      const dedupeKey = hash(
        client,
        search.venueId,
        search.date,
        String(search.requestedMinute),
        String(search.partySize)
      );
      const expiresAt = seen.get(dedupeKey);
      if (expiresAt !== undefined && expiresAt > at) return "duplicate";
      if (!admit(client, at)) return "rate-limited";

      seen.set(dedupeKey, at + DEDUPE_TTL_MS);
      await store.increment({
        venueId: search.venueId,
        date: search.date,
        requestedMinute: search.requestedMinute,
        partySize: search.partySize,
      });
      return "recorded";
    } catch (error) {
      log?.warn({ err: error, venueId: search.venueId }, "lost-demand: recording failed");
      return "failed";
    }
  }

  return { recordNoSlotSearch };
}

export type LostDemandService = ReturnType<typeof createLostDemandService>;

/** Counter upsert: bounded storage, one row per key regardless of search volume. */
const prismaNoSlotSearchStore: NoSlotSearchStore = {
  async increment({ venueId, date, requestedMinute, partySize }) {
    const day = new Date(`${date}T00:00:00.000Z`);
    await prisma.noSlotSearch.upsert({
      where: {
        venueId_date_requestedMinute_partySize: { venueId, date: day, requestedMinute, partySize },
      },
      create: { venueId, date: day, requestedMinute, partySize, searches: 1 },
      update: { searches: { increment: 1 } },
    });
  },
};

export const lostDemandService: LostDemandService = createLostDemandService({
  store: prismaNoSlotSearchStore,
});
