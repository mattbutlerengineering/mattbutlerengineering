import { createHash } from "node:crypto";
import {
  MINUTES_PER_DAY,
  projectLegacyOperatingHours,
  resolveDay,
  serviceDayInstant,
  validateConfig,
  addDays,
} from "@mbe/availability";
import type {
  AvailabilityConfig,
  DateRule,
  ReopenResult,
  SetTonightBody,
  TonightChange,
  TonightResult,
} from "@mbe/types";
import type { Prisma, PrismaClient } from "../generated/prisma/index.js";
import { setVenueContext } from "../middleware/venue-context.js";
import {
  affectedRange,
  diffConfig,
  inverseOf,
  referenceIssues,
} from "./availability-config-plan.js";
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
import {
  createClosure,
  mayCloseFor,
  TONIGHT_RULE_KINDS,
  type ClosureCaller,
  type CreateClosureOutcome,
} from "./closure-command.js";
import { currentServiceDate } from "./closure-command-plan.js";
import { prisma } from "./database.js";

/**
 * The Tonight API (docs/features/venue-availability/architecture.md
 * § Reservations HTTP). A Tonight change is a `tonight` date rule for the
 * current service day with a server-computed `expiresAt`. The engine reads a
 * Tonight rule only on its own `startsOn`, so it is gone from the next service
 * day with no cron and no schedule touched.
 *
 * Pause online, stop window, table blocks and pacing leave existing bookings
 * alone and are written here, through the shared config row writer behind the
 * `availabilityVersion` compare-and-set. A close-early can strand bookings, so
 * it goes through the closure command (decisions, outcomes, cancels and moves
 * in one transaction); this file only builds its rule.
 */

type StoreClient = Pick<PrismaClient, "$transaction">;
type Db = StoreDb;

/** A band that runs to the end of the service day, past-midnight tail included. */
const REST_OF_TONIGHT = 2 * MINUTES_PER_DAY;

export type SetTonightOutcome =
  | { kind: "saved"; result: TonightResult }
  | Exclude<CreateClosureOutcome, { kind: "saved" }>
  | { kind: "rule_exists" };

type Refusal = Exclude<SetTonightOutcome, { kind: "saved" }>;

class Refused extends Error {
  constructor(readonly outcome: Refusal) {
    super(outcome.kind);
  }
}

interface TonightDeps {
  createClosure: typeof createClosure;
}

/**
 * The end of the service day `serviceDate`: midnight after it, or the latest
 * close of its planned services when one runs past midnight. Planned means
 * without Tonight changes, so ending a close-early never moves it.
 */
function dayBoundary(state: ConfigState, serviceDate: string): Date {
  const planned: AvailabilityConfig = {
    ...state.effective,
    dateRules: state.effective.dateRules.filter((r) => r.kind !== "tonight"),
  };
  const closes = resolveDay(
    { timezone: state.timezone, config: planned },
    serviceDate
  ).services.map((s) => s.closesAt);
  const end = Math.max(MINUTES_PER_DAY, ...closes);
  return (
    serviceDayInstant(serviceDate, end, state.timezone) ??
    serviceDayInstant(serviceDate, end + 60, state.timezone) ??
    new Date(`${addDays(serviceDate, 1)}T00:00:00.000Z`)
  );
}

type RuleShape = Pick<
  Extract<DateRule, { kind: "tonight" }>,
  "targetKind" | "payload" | "venueServiceId" | "bookingTypes" | "tableIds"
>;

function shapeOf(change: TonightChange): RuleShape {
  switch (change.type) {
    case "pause_online":
      return {
        targetKind: "booking",
        bookingTypes: ["online"],
        payload: { version: 1, stop: { from: 0, to: REST_OF_TONIGHT } },
      };
    case "close_early":
      return change.venueServiceId
        ? {
            targetKind: "service",
            venueServiceId: change.venueServiceId,
            payload: { version: 1, closeAt: change.closeAt },
          }
        : { targetKind: "venue", payload: { version: 1, closeAt: change.closeAt } };
    case "stop_window":
      return {
        targetKind: "venue",
        payload: { version: 1, stop: { from: change.from, to: change.to } },
      };
    case "block_tables":
      return {
        targetKind: "tables",
        tableIds: change.tableIds,
        payload: {
          version: 1,
          stop: { from: change.from ?? 0, to: change.to ?? REST_OF_TONIGHT },
        },
      };
    case "pacing":
      return { targetKind: "venue", payload: { version: 1, pacing: { covers: change.covers } } };
  }
}

function buildRule(
  body: SetTonightBody,
  serviceDate: string,
  expiresAt: Date
): Extract<DateRule, { kind: "tonight" }> {
  return {
    id: body.ruleId,
    kind: "tonight",
    ...shapeOf(body.change),
    startsOn: serviceDate,
    endsOn: serviceDate,
    expiresAt: expiresAt.toISOString(),
    ...(body.guestMessage ? { guestMessage: body.guestMessage } : {}),
    ...(body.staffNote ? { staffNote: body.staffNote } : {}),
  };
}

function describeChange(change: TonightChange): string {
  switch (change.type) {
    case "pause_online":
      return "Tonight: online booking paused";
    case "close_early":
      return "Tonight: closing early";
    case "stop_window":
      return "Tonight: booking stopped for a window";
    case "block_tables":
      return `Tonight: ${change.tableIds.length} table(s) blocked`;
    case "pacing":
      return `Tonight: pacing lowered to ${change.covers} covers`;
  }
}

const sortKeys = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(sortKeys)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, sortKeys(v)])
        )
      : value;

/** What makes two Tonight rules the same change, for telling a retry from an id clash. */
function fingerprint(rule: DateRule): string {
  return JSON.stringify(
    sortKeys({
      kind: rule.kind,
      targetKind: rule.targetKind,
      venueServiceId: rule.venueServiceId ?? null,
      bookingTypes: rule.bookingTypes ?? [],
      tableIds: [...(rule.tableIds ?? [])].sort(),
      payload: "payload" in rule ? rule.payload : null,
    })
  );
}

/** The stored rule with this id, refusing it when it is a different change. */
function storedSame(
  state: ConfigState,
  rule: DateRule
): Extract<DateRule, { kind: "tonight" }> | null {
  const existing = state.stored.dateRules.find((r) => r.id === rule.id);
  if (!existing) return null;
  if (existing.kind !== "tonight" || fingerprint(existing) !== fingerprint(rule)) {
    throw new Refused({ kind: "rule_exists" });
  }
  return existing;
}

/**
 * The closure command's replay key for a close-early: the id and the change,
 * so the same id with another `closeAt` never replays the first result, even
 * after that close-early was ended and its rule is gone.
 */
function closeEarlyKey(rule: DateRule): string {
  const digest = createHash("sha256").update(fingerprint(rule)).digest("hex").slice(0, 16);
  return `tonight:${rule.id}:${digest}`;
}

interface TonightMeta {
  ruleId: string;
  version: number;
}

const ZERO_OUTCOMES = { cancel: 0, move: 0, keep_notify: 0, keep_silent: 0 };

async function replayOf(
  tx: Db,
  venueId: string,
  rule: Extract<DateRule, { kind: "tonight" }>,
  state: ConfigState
): Promise<TonightResult | null> {
  const existing = storedSame(state, rule);
  if (!existing) return null;
  const saved = await tx.availabilityChange.findFirst({
    where: { venueId, kind: "tonight", inverse: { path: ["tonight", "ruleId"], equals: rule.id } },
    select: { id: true, inverse: true },
  });
  const meta = (saved?.inverse as { tonight?: TonightMeta } | null | undefined)?.tonight;
  return {
    ruleId: rule.id,
    version: meta?.version ?? state.version,
    changeId: saved?.id ?? "",
    serviceDate: existing.startsOn,
    expiresAt: existing.expiresAt ?? rule.expiresAt ?? "",
    outcomes: ZERO_OUTCOMES,
  };
}

async function checkRule(
  tx: Db,
  venueId: string,
  state: ConfigState,
  rule: DateRule
): Promise<AvailabilityConfig> {
  const next: AvailabilityConfig = {
    ...state.effective,
    dateRules: [...state.effective.dateRules.filter((r) => r.id !== rule.id), rule],
  };
  const tables = await tx.table.findMany({ where: { venueId }, select: { id: true } });
  const issues = [
    ...validateConfig(next),
    ...referenceIssues(next, new Set(tables.map((t) => t.id))),
  ];
  if (issues.length > 0) throw new Refused({ kind: "invalid", issues });
  return next;
}

async function writeChange(
  tx: Db,
  input: { venueId: string; actorId: string; now: Date; body: SetTonightBody },
  state: ConfigState,
  rule: Extract<DateRule, { kind: "tonight" }>
): Promise<TonightResult> {
  const { venueId, actorId, now, body } = input;
  const cas = await tx.venue.updateMany({
    where: { id: venueId, availabilityVersion: body.expectedVersion },
    data: { availabilityVersion: { increment: 1 } },
  });
  if (cas.count === 0) throw new Refused((await refuseStale(tx, venueId)) as Refusal);

  const next = await checkRule(tx, venueId, state, rule);
  const diff = diffConfig(state.stored, next);
  await writeConfigDiff(tx, venueId, diff, { actorId, now }).catch((e: unknown) => {
    throw e instanceof ConfigRowConflict ? new Refused(conflictIssue(e, next) as Refusal) : e;
  });
  const version = body.expectedVersion + 1;
  const range = affectedRange(state.stored, diff, civilDateIn(now, state.timezone));
  const meta: TonightMeta = { ruleId: rule.id, version };
  const change = await tx.availabilityChange.create({
    data: {
      venueId,
      actorId,
      at: now,
      kind: "tonight",
      summary: describeChange(body.change),
      affectedFrom: toDbDate(range.from),
      affectedTo: toDbDate(range.to),
      inverse: {
        ...inverseOf(state.stored, diff, state.operatingHours),
        tonight: meta,
      } as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  await tx.venue.update({
    where: { id: venueId },
    data: { operatingHours: projectLegacyOperatingHours(next) },
  });
  return {
    ruleId: rule.id,
    version,
    changeId: change.id,
    serviceDate: rule.startsOn,
    expiresAt: rule.expiresAt ?? "",
    outcomes: ZERO_OUTCOMES,
  };
}

type Prepared =
  | { kind: "saved"; result: TonightResult }
  | { kind: "delegate"; rule: Extract<DateRule, { kind: "tonight" }> };

/**
 * Applies one Tonight change for the venue's current service day. Open to any
 * venue member (Host or Manager); a close-early's Manager/Host limits are the
 * closure command's.
 */
export async function setTonight(
  input: { venueId: string; caller: ClosureCaller; body: SetTonightBody; now: Date },
  client: StoreClient = prisma,
  deps: TonightDeps = { createClosure }
): Promise<SetTonightOutcome> {
  const { venueId, caller, body, now } = input;
  try {
    const prepared = await client.$transaction(async (tx): Promise<Prepared> => {
      await setVenueContext(tx, venueId);
      const state = await loadConfigState(tx, venueId, now);
      if (!state) throw new Refused({ kind: "not_found" });
      const serviceDate = currentServiceDate(
        { timezone: state.timezone, config: state.effective },
        now
      );
      const rule = buildRule(body, serviceDate, dayBoundary(state, serviceDate));
      if (body.change.type === "close_early") {
        storedSame(state, rule);
        return { kind: "delegate", rule };
      }
      const replayed = await replayOf(tx, venueId, rule, state);
      if (replayed) return { kind: "saved", result: replayed };
      if (body.change.type === "stop_window") {
        // A stop over what is left of the service closes the night like a close-early does.
        // After the replay check: a saved stop's retry is not a new close.
        const allowed = await mayCloseFor(tx, venueId, caller, rule, now);
        if (!allowed) throw new Refused({ kind: allowed === null ? "not_found" : "forbidden" });
      }
      const result = await writeChange(
        tx,
        { venueId, actorId: caller.actorId, now, body },
        state,
        rule
      );
      return { kind: "saved", result };
    });
    if (prepared.kind === "saved") return prepared;
    const { rule } = prepared;
    const closed = await deps.createClosure({
      venueId,
      caller,
      body: { expectedVersion: body.expectedVersion, rule, decisions: body.decisions },
      idempotencyKey: closeEarlyKey(rule),
      now,
      ruleKinds: TONIGHT_RULE_KINDS,
    });
    if (closed.kind !== "saved") return closed;
    return {
      kind: "saved",
      result: { ...closed.result, serviceDate: rule.startsOn, expiresAt: rule.expiresAt ?? "" },
    };
  } catch (error) {
    if (error instanceof Refused) return error.outcome;
    throw error;
  }
}

export type EndTonightOutcome = { kind: "ended"; result: ReopenResult } | { kind: "not_found" };

/**
 * Ends a Tonight change early (a soft delete through the same writer, with its
 * inverse). Bookings a close-early cancelled stay cancelled.
 */
export async function endTonight(
  input: { venueId: string; ruleId: string; caller: Pick<ClosureCaller, "actorId">; now: Date },
  client: StoreClient = prisma
): Promise<EndTonightOutcome> {
  const { venueId, ruleId, caller, now } = input;
  return client.$transaction(async (tx): Promise<EndTonightOutcome> => {
    await setVenueContext(tx, venueId);
    const state = await loadConfigState(tx, venueId, now);
    const rule = state?.stored.dateRules.find((r) => r.id === ruleId);
    if (!state || !rule || rule.kind !== "tonight") return { kind: "not_found" };

    const next = {
      ...state.stored,
      dateRules: state.stored.dateRules.filter((r) => r.id !== ruleId),
    };
    const diff = diffConfig(state.stored, next);
    await writeConfigDiff(tx, venueId, diff, { actorId: caller.actorId, now });
    const bumped = await tx.venue.update({
      where: { id: venueId },
      data: {
        availabilityVersion: { increment: 1 },
        operatingHours: projectLegacyOperatingHours(next),
      },
      select: { availabilityVersion: true },
    });
    const range = affectedRange(state.stored, diff, civilDateIn(now, state.timezone));
    const change = await tx.availabilityChange.create({
      data: {
        venueId,
        actorId: caller.actorId,
        at: now,
        kind: "tonight_end",
        summary: "Tonight change ended",
        affectedFrom: toDbDate(range.from),
        affectedTo: toDbDate(range.to),
        inverse: inverseOf(
          state.stored,
          diff,
          state.operatingHours
        ) as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return {
      kind: "ended",
      result: { version: bumped.availabilityVersion, changeId: change.id },
    };
  });
}

/** The store as a domain-service record, for the `buildApp({ services })` seam. */
export const tonightCommandService = { set: setTonight, end: endTonight };
