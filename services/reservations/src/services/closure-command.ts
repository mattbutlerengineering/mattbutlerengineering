import { projectLegacyOperatingHours } from "@mbe/availability";
import type {
  AvailabilityChangeOutcome,
  AvailabilityChangeSummary,
  ClosureAlongside,
  ClosureAction,
  ClosureImpact,
  ClosureResult,
  ClosuresResult,
  CreateClosureBody,
  CreateClosuresBody,
  DateRule,
  ReopenResult,
} from "@mbe/types";
import type { Prisma, PrismaClient } from "../generated/prisma/index.js";
import { setVenueContext } from "../middleware/venue-context.js";
import { affectedRange, diffConfig, inverseOf } from "./availability-config-plan.js";
import { findStrandedReservations } from "./availability-config-checks.js";
import {
  conflictIssue,
  futureBookings,
  loadConfigState,
  refuseStale,
  toDbDate,
  type ConfigState,
  type StoreDb,
} from "./availability-config.js";
import { ConfigRowConflict, writeConfigDiff } from "./availability-config-rows.js";
import { civilDateIn } from "./availability-migration.js";
import { applyTransitions } from "./closure-apply.js";
import {
  checkDecisions,
  countActions,
  currentServiceDate,
  isHostEmergencyClose,
  isEmergencyTonightClose,
  moveTarget,
} from "./closure-command-plan.js";
import { checkAlongside } from "./closure-alongside.js";
import { withAlongside, withClosure } from "./closure-impact.js";
import { impactInTransaction } from "./closure-impact-store.js";
import { prisma } from "./database.js";

/**
 * The closure command (docs/features/venue-availability/architecture.md
 * § Closure command). One transaction compare-and-sets the venue's
 * `availabilityVersion`, writes the date rule (through the same row writer as a
 * config save, with the legacy `operatingHours` projection), one
 * `ClosureOutcome` per affected reservation, the cancels and moves
 * (`closure-apply.ts`, with their reservation events) and the audit row.
 *
 * Not in this file, by design (#7523, #7524): the guest notices and the refund
 * jobs. A cancelled booking's deposit stays `held` and its outcome
 * `refund: pending` for the CLOSURE_REFUND job; no Stripe call is made here.
 */

type StoreClient = Pick<PrismaClient, "$transaction">;
type Db = StoreDb &
  Pick<PrismaClient, "closureOutcome" | "reservationEvent" | "reservationHold" | "$executeRaw">;

/** Rule kinds `POST /closures` saves (and `DELETE` reopens); Tonight has its own endpoints. */
const CLOSURE_RULE_KINDS: ReadonlySet<string> = new Set(["closure", "special_hours"]);

/** The one kind the Tonight API sends through the closure path: a close-early. */
export const TONIGHT_RULE_KINDS: ReadonlySet<string> = new Set(["tonight"]);

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
  | { kind: "closure_exists" }
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
  /** Counts for the History drawer, which words the entry itself. Absent on older rows. */
  outcome?: AvailabilityChangeOutcome;
  /** Set on every item of a batch save: what the whole batch was, so a reused key can be told apart. */
  batch?: BatchShape;
}

/** A batch's identity under its Idempotency-Key: how many items, and which rules, in order. */
interface BatchShape {
  count: number;
  ruleIds: string[];
}

/** Field-wise, so the order jsonb stores object keys in cannot make a replay look different. */
function sameBatch(stored: BatchShape | undefined, now: BatchShape): boolean {
  return (
    stored !== undefined &&
    stored.count === now.count &&
    Array.isArray(stored.ruleIds) &&
    stored.ruleIds.length === now.ruleIds.length &&
    stored.ruleIds.every((id, i) => id === now.ruleIds[i])
  );
}

/**
 * A Host may only make the emergency whole-venue close for the current
 * service day (ADR-029), and only with the grant.
 */
export async function mayCloseFor(
  db: StoreDb,
  venueId: string,
  caller: Pick<ClosureCaller, "isManager">,
  rule: DateRule,
  now: Date
): Promise<boolean | null> {
  const venue = await db.venue.findUnique({
    where: { id: venueId },
    select: { hostEmergencyClose: true },
  });
  if (!venue) return null;
  if (caller.isManager) return true;
  // Tonight changes are a Host's own job, so only the emergency close needs the grant.
  if (rule.kind !== "tonight" && !venue.hostEmergencyClose) return false;
  const state = await loadConfigState(db, venueId, now);
  if (!state) return null;
  const snapshot = { timezone: state.timezone, config: state.effective };
  const serviceDate = currentServiceDate(snapshot, now);
  if (rule.kind !== "tonight") return isHostEmergencyClose(rule, serviceDate);
  if (rule.startsOn !== serviceDate) return false;
  // A Tonight change that leaves nothing bookable on its targets is the emergency close in effect.
  if (venue.hostEmergencyClose) return true;
  // Only active tables seat guests, so an inactive one cannot keep the night open.
  const tables = await db.table.findMany({
    where: { venueId, isActive: true },
    select: { id: true },
  });
  return !isEmergencyTonightClose(
    snapshot,
    rule,
    now,
    tables.map((t) => t.id)
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
): Promise<{ id: string; actorId: string; closure: ClosureMeta } | null> {
  const change = await db.availabilityChange.findFirst({
    where: {
      venueId,
      kind: "closure",
      inverse: { path: ["closure", "idempotencyKey"], equals: key },
    },
    select: { id: true, actorId: true, inverse: true },
  });
  const closure = (change?.inverse as { closure?: ClosureMeta } | null | undefined)?.closure;
  return change && closure ? { id: change.id, actorId: change.actorId, closure } : null;
}

/** The result a saved closure answers a replay with, counted from its outcome rows. */
async function storedResult(
  tx: Pick<PrismaClient, "closureOutcome">,
  venueId: string,
  replay: { id: string; closure: ClosureMeta }
): Promise<ClosureResult> {
  const rows = await tx.closureOutcome.findMany({
    where: { venueId, dateRuleId: replay.closure.ruleId },
    select: { action: true },
  });
  return {
    ruleId: replay.closure.ruleId,
    version: replay.closure.version,
    changeId: replay.id,
    outcomes: countActions(rows.map((r) => r.action)),
  };
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
  alongside: ClosureAlongside | undefined,
  impact: ClosureImpact,
  actions: ReadonlyMap<string, { action: ClosureAction }>,
  now: Date
): Plan | Refusal {
  const after = { timezone: state.timezone, config: withClosure(state.effective, rule, alongside) };
  const rows: Prisma.ClosureOutcomeCreateManyInput[] = [];
  const stuck: string[] = [];
  for (const group of impact.groups) {
    const action = actions.get(group.groupKey)!.action; // checkDecisions answered every group
    for (const r of group.reservations) {
      const target = action === "move" ? moveTarget(after, group.date, r, now) : null;
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
  const what = rule.kind === "tonight" ? "Closing early" : "Closure saved for";
  return `${what} ${span}: ${counts.cancel} cancelled, ${counts.move} moved, ${kept} kept`;
}

async function guard(
  tx: Db,
  input: { venueId: string; caller: ClosureCaller; rule: DateRule; now: Date }
): Promise<void> {
  const allowed = await mayCloseFor(tx, input.venueId, input.caller, input.rule, input.now);
  if (allowed === null) throw new Refused({ kind: "not_found" });
  if (!allowed) throw new Refused({ kind: "forbidden" });
}

type CommitInput = {
  venueId: string;
  caller: ClosureCaller;
  body: CreateClosureBody;
  key: string;
  now: Date;
  ruleKinds: ReadonlySet<string>;
  batch?: BatchShape;
};

/**
 * A known key answers with the stored result and changes nothing, even after
 * the rule was reopened. It is authorised against the original save, not
 * today's date: a Manager always, a Host only for a closure they made.
 */
async function replayOf(tx: Db, input: CommitInput): Promise<ClosureResult | null> {
  const { venueId, caller, body, key } = input;
  const replay = await findReplay(tx, venueId, key);
  if (!replay) return null;
  if (replay.closure.ruleId !== body.rule.id) throw new Refused({ kind: "key_reused" });
  if (!caller.isManager && replay.actorId !== caller.actorId) {
    throw new Refused({ kind: "forbidden" });
  }
  return storedResult(tx, venueId, replay);
}

/**
 * A series edit's `alongside` is a Manager's, and is limited to shortening or removing the one
 * series it replaces and moving that series' skips (`closure-alongside.ts`). As a second guard it
 * must strand no booking by itself: the draft rule's dates are decided in Step 2, anything else
 * the rows change is not.
 */
async function refuseBadAlongside(tx: Db, input: CommitInput, state: ConfigState): Promise<void> {
  const { body, caller, venueId, now } = input;
  const { alongside, rule } = body;
  if (!alongside) return;
  if (!caller.isManager) throw new Refused({ kind: "forbidden" });
  const issue = checkAlongside(state.stored.dateRules, rule, alongside);
  if (issue) throw new Refused({ kind: "invalid", issues: [issue] });
  const today = civilDateIn(now, state.timezone);
  const stranded = findStrandedReservations(
    { timezone: state.timezone, config: state.effective },
    { timezone: state.timezone, config: withAlongside(state.effective, alongside) },
    await futureBookings(tx, venueId, today, now)
  );
  if (stranded.length > 0) {
    throw new Refused({
      kind: "invalid",
      issues: stranded.map((r) => ({
        path: `reservations.${r.id}`,
        code: "strands_booking",
        message: "The rows replaced beside the closure would leave this booking without service.",
      })),
    });
  }
}

/** Refuses what cannot become a clean closure before anything is written. */
async function preflight(tx: Db, input: CommitInput): Promise<void> {
  const { venueId, caller, body, now } = input;
  const { rule } = body;
  await guard(tx, { venueId, caller, rule, now });
  if (!input.ruleKinds.has(rule.kind)) {
    throw new Refused({
      kind: "invalid",
      issues: [
        {
          path: "rule.kind",
          code: "unsupported_kind",
          message: "A closure is saved as a closure or special hours.",
        },
      ],
    });
  }
  // The same rule id again, under a new key or version, is a second save of a
  // closure that already has its outcomes, not a new one.
  const existing = await tx.closureOutcome.count({ where: { venueId, dateRuleId: rule.id } });
  if (existing > 0) throw new Refused({ kind: "closure_exists" });
}

async function commit(tx: Db, input: CommitInput): Promise<ClosureResult> {
  const { venueId, caller, body, key, now } = input;
  const { rule } = body;
  const replayed = await replayOf(tx, input);
  if (replayed) return replayed;
  await preflight(tx, input);
  const cas = await tx.venue.updateMany({
    where: { id: venueId, availabilityVersion: body.expectedVersion },
    data: { availabilityVersion: { increment: 1 } },
  });
  if (cas.count === 0) throw new Refused((await refuseStale(tx, venueId)) as Refusal);

  const state = await loadConfigState(tx, venueId, now);
  if (!state) throw new Refused({ kind: "not_found" });
  // A day with no bookings leaves no outcome rows, so the stored rule is the
  // other witness that this id was already saved.
  if (state.stored.dateRules.some((r) => r.id === rule.id)) {
    throw new Refused({ kind: "closure_exists" });
  }
  await refuseBadAlongside(tx, input, state);
  const found = await impactInTransaction(tx, venueId, state, rule, now, body.alongside);
  if (found.kind !== "ok") throw new Refused(found);
  const checked = checkDecisions(found.impact, body.decisions);
  if (checked.kind === "decision-required") {
    throw new Refused({ kind: "decision_required", groupKeys: checked.groupKeys });
  }
  if (checked.kind === "invalid-decision") {
    throw new Refused({ kind: "invalid_decision", groupKeys: checked.groupKeys });
  }
  const plan = planOutcomes(
    venueId,
    caller.actorId,
    state,
    rule,
    body.alongside,
    found.impact,
    checked.actions,
    now
  );
  if (isRefusal(plan)) throw new Refused(plan);

  const next = withClosure(state.effective, rule, body.alongside);
  const diff = diffConfig(state.stored, next);
  await writeConfigDiff(tx, venueId, diff, { actorId: caller.actorId, now }).catch((e: unknown) => {
    throw e instanceof ConfigRowConflict ? new Refused(conflictIssue(e, next) as Refusal) : e;
  });
  const version = body.expectedVersion + 1;
  const range = affectedRange(state.stored, diff, civilDateIn(now, state.timezone));
  const meta: ClosureMeta = {
    ruleId: rule.id,
    idempotencyKey: key,
    version,
    outcome: {
      cancelled: plan.counts.cancel,
      moved: plan.counts.move,
      kept: plan.counts.keep_notify + plan.counts.keep_silent,
      closeEarly: rule.kind === "tonight",
      startsOn: rule.startsOn,
      endsOn: rule.endsOn ?? null,
    },
    ...(input.batch ? { batch: input.batch } : {}),
  };
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
  const applied = await applyTransitions(
    tx,
    venueId,
    caller.actorId,
    plan.rows.map((r) => ({
      reservationId: r.reservationId,
      action: r.action,
      movedTo: r.movedTo as Date | null,
    }))
  );
  if (applied.kind === "move_conflict") {
    throw new Refused({ kind: "move_unavailable", reservationIds: applied.reservationIds });
  }
  if (applied.kind === "cannot_cancel") {
    throw new Refused({
      kind: "invalid",
      issues: [
        {
          path: `reservations.${applied.reservationId}`,
          code: "cannot_cancel",
          message: applied.detail,
        },
      ],
    });
  }
  return { ruleId: rule.id, version, changeId: change.id, outcomes: plan.counts };
}

export async function createClosure(
  input: {
    venueId: string;
    caller: ClosureCaller;
    body: CreateClosureBody;
    idempotencyKey: string;
    now: Date;
    /** Rule kinds this call may save; the Tonight API widens it to `tonight`. */
    ruleKinds?: ReadonlySet<string>;
  },
  client: StoreClient = prisma
): Promise<CreateClosureOutcome> {
  const { venueId, caller, body, idempotencyKey: key, now } = input;
  const ruleKinds = input.ruleKinds ?? CLOSURE_RULE_KINDS;
  try {
    const result = await client.$transaction(async (tx) => {
      await setVenueContext(tx, venueId);
      return commit(tx, { venueId, caller, body, key, now, ruleKinds });
    });
    return { kind: "saved", result };
  } catch (error) {
    if (error instanceof Refused) return error.outcome;
    throw error;
  }
}

export type CreateClosuresOutcome =
  { kind: "saved"; result: ClosuresResult } | Exclude<CreateClosureOutcome, { kind: "saved" }>;

/**
 * Several closures in one transaction (ux.md F6, "Add special date"). Each item commits exactly
 * as `createClosure` would, in order, from the version the one before it left, so a booking's
 * outcome, its notice and its refund stay keyed to its own rule. Any refusal rolls back every
 * item: no booking is cancelled for one date while another date fails. Item `i` replays under
 * `<key>#i`. Manager only; a Host's emergency close is a single `createClosure`.
 */
export async function createClosures(
  input: {
    venueId: string;
    caller: ClosureCaller;
    body: CreateClosuresBody;
    idempotencyKey: string;
    now: Date;
  },
  client: StoreClient = prisma
): Promise<CreateClosuresOutcome> {
  const { venueId, caller, body, idempotencyKey: key, now } = input;
  if (!caller.isManager) return { kind: "forbidden" };
  try {
    const results = await client.$transaction(async (tx) => {
      await setVenueContext(tx, venueId);
      const saved: ClosureResult[] = [];
      const batch: BatchShape = {
        count: body.items.length,
        ruleIds: body.items.map((i) => i.rule.id),
      };
      // A key already used for a batch answers only to that same batch: never a subset of it,
      // and never a longer one whose appended items would commit beside the replayed ones.
      const first = await findReplay(tx, venueId, `${key}#0`);
      if (first && !sameBatch(first.closure.batch, batch)) {
        throw new Refused({ kind: "key_reused" });
      }
      let expectedVersion = body.expectedVersion;
      for (const [i, item] of body.items.entries()) {
        const result = await commit(tx, {
          venueId,
          caller,
          body: { expectedVersion, rule: item.rule, decisions: item.decisions },
          key: `${key}#${i}`,
          now,
          ruleKinds: CLOSURE_RULE_KINDS,
          batch,
        });
        saved.push(result);
        expectedVersion = result.version;
      }
      return saved;
    });
    return { kind: "saved", result: { version: results.at(-1)!.version, results } };
  } catch (error) {
    if (error instanceof Refused) return error.outcome;
    throw error;
  }
}

// ── Reopen ──────────────────────────────────────────────────────────────────

/** A Host may only reopen a closure they made themselves (the actor on its audit row). */
async function requireAuthor(
  db: Pick<PrismaClient, "availabilityChange">,
  venueId: string,
  ruleId: string,
  actorId: string
): Promise<void> {
  const saved = await db.availabilityChange.findFirst({
    where: { venueId, kind: "closure", inverse: { path: ["closure", "ruleId"], equals: ruleId } },
    orderBy: { at: "desc" },
    select: { actorId: true },
  });
  if (saved?.actorId !== actorId) throw new Refused({ kind: "forbidden" });
}

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
      if (!state || !rule || !CLOSURE_RULE_KINDS.has(rule.kind)) {
        throw new Refused({ kind: "not_found" });
      }
      await guard(db, { venueId, caller, rule, now });
      if (!caller.isManager) await requireAuthor(db, venueId, ruleId, caller.actorId);

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
export const closureCommandService = {
  create: createClosure,
  createMany: createClosures,
  reopen: reopenClosure,
  mayClose,
};
