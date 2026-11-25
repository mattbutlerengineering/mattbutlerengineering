import { projectLegacyOperatingHours } from "@mbe/availability";
import type {
  AvailabilityChangeDetail,
  AvailabilityConfig,
  PutAvailabilityConfigBody,
} from "@mbe/types";
import type { Prisma } from "../generated/prisma/index.js";
import { referenceIssues } from "./availability-config-plan.js";
import { findStrandedReservations } from "./availability-config-checks.js";
import { checkAvailability } from "./availability-check.js";
import { touchedIssues } from "./availability-touched-issues.js";
import { inAvailabilityTransaction, refuse, Refused } from "./availability-refusal.js";
import { ConfigRowConflict, writeConfigDiff } from "./availability-config-rows.js";
import { civilDateIn } from "./availability-migration.js";
import { validateConfig } from "@mbe/availability";
import { prisma } from "./database.js";
import { loadSectionIndex } from "./section-index.js";
import {
  conflictIssue,
  detailData,
  futureBookings,
  getAvailabilityConfig,
  listAvailabilityDays,
  loadConfigState,
  planSave,
  previewAvailabilityConfig,
  refuseStale,
  toDbDate,
  writePlan,
  type ConfigState,
  type SavedChange,
  type SaveOutcome,
  type SavePlan,
  type StoreClient,
  type StoreDb,
} from "./availability-config.js";

/**
 * The one save path of the availability store (docs/features/venue-availability/
 * architecture.md § Availability store): `commitSave` bumps `Venue.availabilityVersion`, writes
 * the config rows and one `AvailabilityChange`, and rewrites the legacy `Venue.operatingHours`,
 * all in the caller's transaction. Split from `availability-config.ts` (reads, the pure planner,
 * the refusal builders) to keep both under the file cap.
 */

/** Where a save's config comes from: edits to settle, or a config the command already built. */
type SaveSource =
  | {
      changes: PutAvailabilityConfigBody["changes"];
      scopeConflicts: PutAvailabilityConfigBody["scopeConflicts"];
      next?: undefined;
      validate?: undefined;
    }
  | {
      /** The config to write, not settled against scope conflicts. */
      next: AvailabilityConfig;
      /**
       * `"full"` (the default) refuses any issue in the config; `"touched"` only those on rows
       * this change creates or updates, so a venue holding an unrelated invalid row can still
       * be changed (a Host reopening during service).
       */
      validate?: "full" | "touched";
      changes?: undefined;
      scopeConflicts?: undefined;
    };

/** What a save commits: the row operations, and how its audit row reads. */
export type SaveRequest = SaveSource & SaveRequestFields;

/** What a request's `prepare` adds to the audit row once the plan is known. */
export interface SavePrepared {
  /** Merged into the audit row's `inverse` (a Tonight change's replay key). */
  inverseMeta?: Record<string, unknown>;
  summary?: string;
  detail?: AvailabilityChangeDetail | null;
  /** Replaces the plan's affected dates (a one-date reopen links to its day). */
  range?: { from: string | null; to: string | null };
  /** Whether guests were told; the column's default when absent. */
  notifiedGuests?: boolean;
}

type WritePlan = Extract<SavePlan, { kind: "write" }>;

interface SaveRequestFields {
  /** The audit row's `kind`. */
  kind: string;
  /** Replaces the generated summary. */
  summary?: string;
  /** Replaces the generated code and data; `null` for none (a revert of a change that had none). */
  detail?: AvailabilityChangeDetail | null;
  /**
   * `"refuse"` (the default) refuses a change that strands a booking; `"caller"` leaves that to
   * the caller, which has settled it already (Tonight leaves bookings alone).
   */
  stranded?: "refuse" | "caller";
  /**
   * Runs once the config rows are written and before the audit row, so it can read what the
   * write left (outcomes re-keyed onto a new rule); what it returns overrides the audit row.
   */
  prepare?: (tx: StoreDb, plan: WritePlan) => Promise<SavePrepared> | SavePrepared;
  /** Written to `Venue.operatingHours` in place of the projection of the next config. */
  operatingHours?: Prisma.InputJsonValue | typeof Prisma.DbNull;
  /** Permit the result to have no live schedule (an undone first save). */
  allowNoHours?: boolean;
  /** Apply the rows exactly, without settling scope conflicts (a revert). */
  exact?: boolean;
  /** Date rules to bring back from soft-deletion instead of creating. */
  revive?: ReadonlySet<string>;
  /** Runs in the save transaction once the audit row exists. */
  afterChange?: (tx: StoreDb, changeId: string) => Promise<void>;
}

/**
 * `{ expected }` is a compare-and-set a stale draft is refused at; `{ current: true }` bumps
 * unconditionally, for a command that takes no `expectedVersion` (ending Tonight, #8121).
 */
export type SaveVersion = { expected: number } | { current: true };

/** Takes the venue row lock by bumping `availabilityVersion`; answers the version it reached. */
async function bumpVersion(tx: StoreDb, venueId: string, version: SaveVersion) {
  if ("current" in version) {
    const bumped = await tx.venue.update({
      where: { id: venueId },
      data: { availabilityVersion: { increment: 1 } },
      select: { availabilityVersion: true },
    });
    return bumped.availabilityVersion;
  }
  const cas = await tx.venue.updateMany({
    where: { id: venueId, availabilityVersion: version.expected },
    data: { availabilityVersion: { increment: 1 } },
  });
  if (cas.count === 0) return refuse(await refuseStale(tx, venueId, version.expected));
  return version.expected + 1;
}

/** Plans a request: settled against the draft, or the config the command already built. */
async function planRequest(
  tx: StoreDb,
  state: ConfigState,
  request: SaveRequest,
  input: { venueId: string; now: Date }
): Promise<SavePlan> {
  const { venueId, now } = input;
  const [tables, sections] = await Promise.all([
    tx.table.findMany({ where: { venueId }, select: { id: true } }),
    loadSectionIndex(tx, venueId),
  ]);
  const tableIds = new Set(tables.map((t) => t.id));
  const bookings =
    request.stranded === "caller"
      ? []
      : await futureBookings(tx, venueId, civilDateIn(now, state.timezone), now);
  if (!request.next) {
    return planSave({
      state,
      body: { changes: request.changes, scopeConflicts: request.scopeConflicts },
      bookings,
      tableIds,
      sections,
      now,
      ...(request.allowNoHours ? { allowNoHours: true } : {}),
      ...(request.exact ? { exact: true } : {}),
    });
  }
  const plan = writePlan(state, request.next, now);
  const found = [
    ...validateConfig(request.next),
    ...referenceIssues(request.next, tableIds, sections.ids),
  ];
  const issues =
    request.validate === "touched" ? touchedIssues(found, request.next, plan.diff) : found;
  if (issues.length > 0) return { kind: "invalid", issues };
  const reservations = findStrandedReservations(
    { timezone: state.timezone, config: state.effective },
    { timezone: state.timezone, config: request.next },
    bookings
  );
  return reservations.length > 0 ? { kind: "stranded", reservations } : plan;
}

/**
 * The one save path. Bump `availabilityVersion` first (it takes the venue row lock, so
 * concurrent saves serialize here; compare-and-set on `{ expected }`), then `resolve` the request
 * against the loaded state, validate, stranded-check, write the rows, the audit row and the
 * legacy projection. Revert and Tonight go through here too.
 * Every refusal is thrown (`refuse`), so it rolls the bump back with the rest; call it inside
 * `inAvailabilityTransaction`. Replay and permission checks belong before it: a retry never bumps.
 */
export async function commitSave(
  tx: StoreDb,
  input: {
    venueId: string;
    actorId: string;
    actorName?: string | null;
    version: SaveVersion;
    now: Date;
  },
  resolve: (state: ConfigState, committed: { committedVersion: number }) => Promise<SaveRequest>
): Promise<SavedChange> {
  const { venueId, actorId, actorName = null, now } = input;
  const version = await bumpVersion(tx, venueId, input.version);

  const state = await loadConfigState(tx, venueId, now);
  if (!state) return refuse({ kind: "not_found" });
  const request = await resolve(state, { committedVersion: version });
  const plan = await planRequest(tx, state, request, { venueId, now });
  if (plan.kind !== "write") return refuse(plan);

  await writeConfigDiff(tx, venueId, plan.diff, {
    actorId,
    now,
    ...(request.revive ? { revive: request.revive } : {}),
  }).catch((error: unknown) => {
    throw error instanceof ConfigRowConflict ? new Refused(conflictIssue(error, plan.next)) : error;
  });
  const prepared = (await request.prepare?.(tx, plan)) ?? {};
  const range = prepared.range ?? plan.range;
  const detail = prepared.detail !== undefined ? prepared.detail : request.detail;
  const change = await tx.availabilityChange.create({
    data: {
      venueId,
      actorId,
      actorName,
      at: now,
      kind: request.kind,
      summary: prepared.summary ?? request.summary ?? plan.summary,
      ...detailData(detail === undefined ? plan.detail : detail),
      affectedFrom: toDbDate(range.from),
      affectedTo: toDbDate(range.to),
      inverse: { ...plan.inverse, ...prepared.inverseMeta } as unknown as Prisma.InputJsonValue,
      ...(prepared.notifiedGuests === undefined ? {} : { notifiedGuests: prepared.notifiedGuests }),
      version,
    },
    select: { id: true },
  });
  await request.afterChange?.(tx, change.id);
  await tx.venue.update({
    where: { id: venueId },
    data: { operatingHours: request.operatingHours ?? projectLegacyOperatingHours(plan.next) },
  });
  return { kind: "saved", version, changeId: change.id };
}

export async function saveAvailabilityConfig(
  input: {
    venueId: string;
    actorId: string;
    actorName?: string | null;
    body: PutAvailabilityConfigBody;
    now: Date;
  },
  client: StoreClient = prisma
): Promise<SaveOutcome> {
  const { venueId, actorId, actorName, body, now } = input;
  return inAvailabilityTransaction<SavedChange, SaveOutcome>(client, venueId, (tx) =>
    commitSave(
      tx,
      { venueId, actorId, actorName, version: { expected: body.expectedVersion }, now },
      async () => ({
        changes: body.changes,
        scopeConflicts: body.scopeConflicts,
        kind: "config",
      })
    )
  );
}

/** The store as a domain-service record, for the `buildApp({ services })` seam. */
export const availabilityConfigService = {
  check: checkAvailability,
  get: getAvailabilityConfig,
  listDays: listAvailabilityDays,
  save: saveAvailabilityConfig,
  preview: previewAvailabilityConfig,
};
