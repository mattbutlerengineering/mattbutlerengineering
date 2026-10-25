import { addDays, validateConfig } from "@mbe/availability";
import type { AvailabilityConfig, ClosureImpact, DateRule } from "@mbe/types";
import type { PrismaClient } from "../generated/prisma/index.js";
import { setVenueContext } from "../middleware/venue-context.js";
import { referenceIssues, SCOPE_CONFLICT_HORIZON_DAYS } from "./availability-config-plan.js";
import { loadConfigState, type ConfigState } from "./availability-config.js";
import { civilDateIn } from "./availability-migration.js";
import { computeClosureImpact, type ImpactBooking } from "./closure-impact.js";
import { prisma } from "./database.js";
import { NOT_BOOKED_STATUSES } from "./slot-rules.js";

/**
 * Loads what `computeClosureImpact` needs for a draft date rule, read-only and
 * inside the venue's RLS context (architecture.md § Closure command: the
 * affected-set preview is the closure's own query, run without writing).
 */

type StoreClient = Pick<PrismaClient, "$transaction">;
type ImpactDb = Pick<PrismaClient, "table" | "reservation">;

export type ClosureImpactOutcome =
  | { kind: "ok"; impact: ClosureImpact }
  | { kind: "not_found" }
  | { kind: "too_long" }
  | { kind: "invalid"; issues: { path: string; code: string; message: string }[] };

const toDbDate = (d: string): Date => new Date(`${d}T00:00:00.000Z`);

/** Replaces a rule with the same id, as the closure will when it is saved. */
function withDraft(config: AvailabilityConfig, rule: DateRule): AvailabilityConfig {
  return { ...config, dateRules: [...config.dateRules.filter((r) => r.id !== rule.id), rule] };
}

/**
 * The service dates to scan, or null when an explicit range is over a year.
 * From yesterday at the earliest: a service running past midnight is still
 * yesterday's (ADR-029), and earlier days have no future booking. An
 * open-ended rule is scanned a year ahead.
 */
function scanRange(rule: DateRule, today: string): { from: string; to: string } | null {
  const horizon = addDays(rule.startsOn, SCOPE_CONFLICT_HORIZON_DAYS);
  if (rule.endsOn && rule.endsOn > horizon) return null;
  const earliest = addDays(today, -1);
  const from = rule.startsOn > earliest ? rule.startsOn : earliest;
  return { from, to: rule.endsOn ?? addDays(from, SCOPE_CONFLICT_HORIZON_DAYS) };
}

/**
 * The impact of a draft rule against an already-loaded config state, inside
 * the caller's transaction. The closure command runs this same query before
 * it writes.
 */
export async function impactInTransaction(
  tx: ImpactDb,
  venueId: string,
  state: ConfigState,
  rule: DateRule,
  now: Date
): Promise<ClosureImpactOutcome> {
  const tables = await tx.table.findMany({ where: { venueId }, select: { id: true } });
  const next = withDraft(state.effective, rule);
  const issues = [
    ...validateConfig(next),
    ...referenceIssues(next, new Set(tables.map((t) => t.id))),
  ];
  if (issues.length > 0) return { kind: "invalid", issues };

  const range = scanRange(rule, civilDateIn(now, state.timezone));
  if (!range) return { kind: "too_long" };

  const rows = await tx.reservation.findMany({
    where: {
      venueId,
      date: { gte: toDbDate(range.from), lte: toDbDate(range.to) },
      startTime: { gte: now },
      status: { notIn: [...NOT_BOOKED_STATUSES] },
    },
    select: {
      id: true,
      tableId: true,
      date: true,
      startTime: true,
      endTime: true,
      partySize: true,
      guestName: true,
      deposit: { select: { amountCents: true, currency: true, status: true } },
    },
  });
  const bookings: ImpactBooking[] = rows.map(({ deposit, ...row }) => ({
    ...row,
    heldDeposit:
      deposit?.status === "held"
        ? { amountCents: deposit.amountCents, currency: deposit.currency }
        : null,
  }));
  const impact = computeClosureImpact({
    timezone: state.timezone,
    config: state.effective,
    rule,
    bookings,
  });
  return { kind: "ok", impact };
}

export async function getClosureImpact(
  venueId: string,
  rule: DateRule,
  now: Date,
  client: StoreClient = prisma
): Promise<ClosureImpactOutcome> {
  return client.$transaction(async (tx) => {
    await setVenueContext(tx, venueId);
    const state = await loadConfigState(tx, venueId, now);
    if (!state) return { kind: "not_found" as const };
    return impactInTransaction(tx, venueId, state, rule, now);
  });
}

/** The store as a domain-service record, for the `buildApp({ services })` seam. */
export const closureImpactService = { impact: getClosureImpact };
