import { projectLegacyOperatingHours } from "@mbe/availability";
import type {
  AvailabilityChangeSummary,
  AvailabilityConfig,
  ClosureAction,
  ClosureImpact,
  ClosureResult,
  CreateClosureBody,
  DateRule,
  ReopenResult,
} from "@mbe/types";
import type { Prisma, PrismaClient } from "../generated/prisma/index.js";
import { setVenueContext } from "../middleware/venue-context.js";
import { affectedRange, diffConfig, inverseOf } from "./availability-config-plan.js";
import {
  conflictIssue,
  loadConfigState,
  refuseStale,
  toDbDate,
  type ConfigState,
  type StoreDb,
} from "./availability-config.js";
import { ConfigRowConflict, writeConfigDiff } from "./availability-config-rows.js";
import { civilDateIn } from "./availability-migration.js";
import { applyClosureOutcomes, type ClosureTransitions } from "./closure-apply.js";
import { checkDecisions, isHostEmergencyClose, moveTarget } from "./closure-command-plan.js";
import { impactInTransaction } from "./closure-impact-store.js";
import { prisma } from "./database.js";

/**
 * The closure command (docs/features/venue-availability/architecture.md
 * § Closure command). One transaction compare-and-sets the venue's
 * `availabilityVersion`, writes the date rule (through the same row writer as a
 * config save, with the legacy `operatingHours` projection), one
 * `ClosureOutcome` per affected reservation and the audit row. The cancels and
 * moves then run from the outcome rows (`closure-apply.ts`).
 *
 * Not in this file, by design (#7523, #7524): the guest notices and the refund
 * jobs. Outcome rows carry what they consume (`action`, `refund: pending`).
 */

type StoreClient = Pick<PrismaClient, "$transaction">;
type Db = StoreDb & Pick<PrismaClient, "closureOutcome">;

export interface ClosureCaller {
  /** Owner, manager or platform admin. Anyone else is a Host. */
  isManager: boolean;
  actorId: string;
}

export type CreateClosureOutcome =
  | { kind: "saved"; result: ClosureResult }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "too_long" }
  | { kind: "version_conflict"; winningChange: AvailabilityChangeSummary | null }
  | { kind: "key_reused" }
  | { kind: "invalid"; issues: { path: string; code: string; message: string }[] }
  | { kind: "decision_required"; groupKeys: string[] }
  | { kind: "invalid_decision"; groupKeys: string[] }
  | { kind: "move_unavailable"; reservationIds: string[] };

type Refusal = Exclude<CreateClosureOutcome, { kind: "saved" }>;

/** Thrown inside the transaction to roll back the version bump. */
class Refused extends Error {
  constructor(readonly outcome: Refusal) {
    super(outcome.kind);
  }
}

/** What the audit row's `inverse` carries beyond the undo data: the replay key. */
interface ClosureMeta {
  ruleId: string;
  idempotencyKey: string;
  version: number;
}

type Committed = { ruleId: string; version: number; changeId: string };

/** A Host may only make the emergency whole-venue close for tonight, and only with the grant. */
export async function mayCloseFor(
  db: Pick<PrismaClient, "venue">,
  venueId: string,
  caller: Pick<ClosureCaller, "isManager">,
  rule: DateRule,
  now: Date
): Promise<boolean | null> {
  const venue = await db.venue.findUnique({
    where: { id: venueId },
    select: { hostEmergencyClose: true, ianaTimezone: true },
  });
  if (!venue) return null;
  if (caller.isManager) return true;
  return (
    venue.hostEmergencyClose && isHostEmergencyClose(rule, civilDateIn(now, venue.ianaTimezone))
  );
}

/** Read-only form of the same limits, for the impact preview: `null` for an unknown venue. */
export function mayClose(
  venueId: string,
  isManager: boolean,
  rule: DateRule,
  now: Date,
  client: StoreClient = prisma
): Promise<boolean | null> {
  return client.$transaction(async (tx) => {
    await setVenueContext(tx, venueId);
    return mayCloseFor(tx, venueId, { isManager }, rule, now);
  });
}

async function findReplay(
  db: Pick<PrismaClient, "availabilityChange">,
  venueId: string,
  key: string
): Promise<{ id: string; closure: ClosureMeta } | null> {
  const change = await db.availabilityChange.findFirst({
    where: {
      venueId,
      kind: "closure",
      inverse: { path: ["closure", "idempotencyKey"], equals: key },
    },
    select: { id: true, inverse: true },
  });
  const closure = (change?.inverse as { closure?: ClosureMeta } | null | undefined)?.closure;
  return change && closure ? { id: change.id, closure } : null;
}

function withRule(config: AvailabilityConfig, rule: DateRule): AvailabilityConfig {
  return { ...config, dateRules: [...config.dateRules.filter((r) => r.id !== rule.id), rule] };
}

interface Plan {
  rows: Prisma.ClosureOutcomeCreateManyInput[];
  counts: Record<ClosureAction, number>;
  notifiedGuests: boolean;
}

/** One outcome row per affected reservation, from its group's decision. */
function planOutcomes(
  venueId: string,
  actorId: string,
  state: ConfigState,
  rule: DateRule,
  impact: ClosureImpact,
  actions: ReadonlyMap<string, { action: ClosureAction }>
): Plan | Refusal {
  const after = { timezone: state.timezone, config: withRule(state.effective, rule) };
  const rows: Prisma.ClosureOutcomeCreateManyInput[] = [];
  const stuck: string[] = [];
  for (const group of impact.groups) {
    const action = actions.get(group.groupKey)!.action; // checkDecisions answered every group
    for (const r of group.reservations) {
      const target = action === "move" ? moveTarget(after, group.date, r) : null;
      if (action === "move" && !target) stuck.push(r.id);
      rows.push({
        venueId,
        dateRuleId: rule.id,
        reservationId: r.id,
        action,
        movedTo: target?.startTime ?? null,
        refund: action === "cancel" && r.deposit ? "pending" : "none",
        acknowledgedBy: action === "keep_silent" ? actorId : null,
      });
    }
  }
  if (stuck.length > 0) return { kind: "move_unavailable", reservationIds: stuck };
  const counts = { cancel: 0, move: 0, keep_notify: 0, keep_silent: 0 };
  for (const row of rows) counts[row.action] += 1;
  const notifiedGuests = [...actions.values()].some((d) => d.action !== "keep_silent");
  return { rows, counts, notifiedGuests };
}

const isRefusal = (p: Plan | Refusal): p is Refusal => "kind" in p;

function describe(rule: DateRule, counts: Record<ClosureAction, number>): string {
  const span =
    rule.endsOn && rule.endsOn !== rule.startsOn
      ? `${rule.startsOn} to ${rule.endsOn}`
      : rule.startsOn;
  const kept = counts.keep_notify + counts.keep_silent;
  return `Closure saved for ${span}: ${counts.cancel} cancelled, ${counts.move} moved, ${kept} kept`;
}

async function guard(
  tx: Db,
  input: { venueId: string; caller: ClosureCaller; rule: DateRule; now: Date }
): Promise<void> {
  const allowed = await mayCloseFor(tx, input.venueId, input.caller, input.rule, input.now);
  if (allowed === null) throw new Refused({ kind: "not_found" });
  if (!allowed) throw new Refused({ kind: "forbidden" });
}

async function commit(
  tx: Db,
  input: { venueId: string; caller: ClosureCaller; body: CreateClosureBody; key: string; now: Date }
): Promise<Committed> {
  const { venueId, caller, body, key, now } = input;
  const { rule } = body;
  await guard(tx, { venueId, caller, rule, now });
  const cas = await tx.venue.updateMany({
    where: { id: venueId, availabilityVersion: body.expectedVersion },
    data: { availabilityVersion: { increment: 1 } },
  });
  if (cas.count === 0) {
    const replay = await findReplay(tx, venueId, key);
    if (replay) {
      if (replay.closure.ruleId !== rule.id) throw new Refused({ kind: "key_reused" });
      return { ruleId: rule.id, version: replay.closure.version, changeId: replay.id };
    }
    const stale = await refuseStale(tx, venueId);
    throw new Refused(stale as Refusal);
  }

  const state = await loadConfigState(tx, venueId, now);
  if (!state) throw new Refused({ kind: "not_found" });
  const found = await impactInTransaction(tx, venueId, state, rule, now);
  if (found.kind !== "ok") throw new Refused(found);
  const checked = checkDecisions(found.impact, body.decisions);
  if (checked.kind === "decision-required") {
    throw new Refused({ kind: "decision_required", groupKeys: checked.groupKeys });
  }
  if (checked.kind === "invalid-decision") {
    throw new Refused({ kind: "invalid_decision", groupKeys: checked.groupKeys });
  }
  const plan = planOutcomes(venueId, caller.actorId, state, rule, found.impact, checked.actions);
  if (isRefusal(plan)) throw new Refused(plan);

  const next = withRule(state.effective, rule);
  const diff = diffConfig(state.stored, next);
  await writeConfigDiff(tx, venueId, diff, { actorId: caller.actorId, now }).catch((e: unknown) => {
    throw e instanceof ConfigRowConflict ? new Refused(conflictIssue(e, next) as Refusal) : e;
  });
  const version = body.expectedVersion + 1;
  const range = affectedRange(state.stored, diff, civilDateIn(now, state.timezone));
  const meta: ClosureMeta = { ruleId: rule.id, idempotencyKey: key, version };
  const inverse = { ...inverseOf(state.stored, diff, state.operatingHours), closure: meta };
  const change = await tx.availabilityChange.create({
    data: {
      venueId,
      actorId: caller.actorId,
      at: now,
      kind: "closure",
      summary: describe(rule, plan.counts),
      affectedFrom: toDbDate(range.from),
      affectedTo: toDbDate(range.to),
      inverse: inverse as unknown as Prisma.InputJsonValue,
      notifiedGuests: plan.notifiedGuests,
    },
    select: { id: true },
  });
  await tx.venue.update({
    where: { id: venueId },
    data: { operatingHours: projectLegacyOperatingHours(next) },
  });
  if (plan.rows.length > 0) await tx.closureOutcome.createMany({ data: plan.rows });
  return { ruleId: rule.id, version, changeId: change.id };
}

export async function createClosure(
  input: {
    venueId: string;
    caller: ClosureCaller;
    body: CreateClosureBody;
    idempotencyKey: string;
    now: Date;
  },
  transitions: ClosureTransitions,
  client: StoreClient = prisma
): Promise<CreateClosureOutcome> {
  const { venueId, caller, body, idempotencyKey: key, now } = input;
  let committed: Committed;
  try {
    committed = await client.$transaction(async (tx) => {
      await setVenueContext(tx, venueId);
      return commit(tx, { venueId, caller, body, key, now });
    });
  } catch (error) {
    if (error instanceof Refused) return error.outcome;
    throw error;
  }
  const applied = await applyClosureOutcomes(client, venueId, committed.ruleId, transitions);
  return { kind: "saved", result: { ...committed, ...applied } };
}

// ── Reopen ──────────────────────────────────────────────────────────────────

export type ReopenOutcome =
  { kind: "reopened"; result: ReopenResult } | { kind: "not_found" } | { kind: "forbidden" };

/**
 * Removes the rule (a soft delete through the same writer, with its inverse),
 * so the slots return. Guests the closure cancelled stay cancelled. Whether
 * to tell them is recorded on the audit row for the reopen notice (#7523).
 */
export async function reopenClosure(
  input: {
    venueId: string;
    ruleId: string;
    caller: ClosureCaller;
    tellCancelledGuests: boolean;
    now: Date;
  },
  client: StoreClient = prisma
): Promise<ReopenOutcome> {
  const { venueId, ruleId, caller, now } = input;
  try {
    return await client.$transaction(async (tx) => {
      await setVenueContext(tx, venueId);
      const db = tx as unknown as Db;
      const state = await loadConfigState(db, venueId, now);
      const rule = state?.stored.dateRules.find((r) => r.id === ruleId);
      if (!state || !rule) throw new Refused({ kind: "not_found" });
      await guard(db, { venueId, caller, rule, now });

      const next = {
        ...state.stored,
        dateRules: state.stored.dateRules.filter((r) => r.id !== ruleId),
      };
      const diff = diffConfig(state.stored, next);
      await writeConfigDiff(db, venueId, diff, { actorId: caller.actorId, now });
      const bumped = await db.venue.update({
        where: { id: venueId },
        data: {
          availabilityVersion: { increment: 1 },
          operatingHours: projectLegacyOperatingHours(next),
        },
        select: { availabilityVersion: true },
      });
      const range = affectedRange(state.stored, diff, civilDateIn(now, state.timezone));
      const change = await db.availabilityChange.create({
        data: {
          venueId,
          actorId: caller.actorId,
          at: now,
          kind: "reopen",
          summary: `Closure reopened (${rule.startsOn})`,
          affectedFrom: toDbDate(range.from),
          affectedTo: toDbDate(range.to),
          inverse: inverseOf(
            state.stored,
            diff,
            state.operatingHours
          ) as unknown as Prisma.InputJsonValue,
          notifiedGuests: input.tellCancelledGuests,
        },
        select: { id: true },
      });
      return {
        kind: "reopened" as const,
        result: { version: bumped.availabilityVersion, changeId: change.id },
      };
    });
  } catch (error) {
    if (error instanceof Refused) return error.outcome as ReopenOutcome;
    throw error;
  }
}

/** The store as a domain-service record, for the `buildApp({ services })` seam. */
export const closureCommandService = { create: createClosure, reopen: reopenClosure, mayClose };
