import {
  createProblemDetails,
  partyFitsTable,
  type PartyFitTable,
  type ProblemDetails,
  type VenueSettings,
} from "@mbe/types";
import {
  MINUTES_PER_DAY,
  addDays,
  judge,
  localDateTimeOf,
  owningServiceDate,
  resolveDay,
} from "@mbe/availability";
import type {
  BookingChannel,
  BookingSnapshot,
  HardReason,
  SoftLimit,
  Verdict,
} from "@mbe/availability";
import {
  loadAvailabilitySnapshot,
  type LoadSnapshotOptions,
  type SnapshotLogger,
} from "./availability-snapshot.js";
import {
  checkTableConflict,
  checkPacingForSlot,
  type ReservationSlim,
  type HoldSlim,
} from "./slot-rules.js";

export type BookableError =
  | { code: "PARTY_DOES_NOT_FIT"; message: string }
  | { code: "CONFLICT"; message: string }
  | { code: "PACING_EXCEEDED"; message: string };

export interface AssertBookableOptions {
  /** Table being checked for conflict. */
  tableId: string;
  /**
   * The table's party-fit fields. Pass it wherever the caller names the table
   * (the server-picked path already filters by fit): the party must satisfy
   * partyFitsTable. Omit only when fit was settled earlier (hold confirmation,
   * whose hold was fit-checked at creation).
   */
  table?: PartyFitTable;
  /** Window to check — [startTime, endTime). */
  window: { startTime: Date; endTime: Date };
  /** Party size to add when computing pacing. */
  partySize: number;
  /** Venue pacing settings. */
  settings: VenueSettings | null | undefined;
  /** Pre-fetched reservation slices for the date. */
  reservations: ReservationSlim[];
  /** Pre-fetched hold slices for the date. */
  holds: HoldSlim[];
  /** Exclude this hold ID from conflict checks (used during confirmation). */
  excludeHoldId?: string;
  /** Exclude this session ID's holds from conflict checks (used during hold create). */
  excludeSessionId?: string;
  /** The instant hold expiry is judged against. Defaults to the wall clock. */
  now?: Date;
}

/**
 * Single canonical booking invariant check.
 *
 * Runs the table conflict predicate AND the pacing rule together over
 * pre-fetched slices. Returns a BookableError if either check fails, or
 * undefined if the slot is bookable.
 *
 * Pure function — no DB access. Callers fetch slices once and pass them in.
 * Currently used by confirm-hold (closing the pacing gap on hold confirmation).
 * Intended to absorb hold-create, walk-in-create, and slot generation next so
 * those write paths share one conflict+pacing rule and cannot diverge.
 */
export function assertBookable(opts: AssertBookableOptions): BookableError | undefined {
  const {
    tableId,
    window: { startTime, endTime },
    partySize,
    settings,
    holds,
    excludeHoldId,
    excludeSessionId,
    now = new Date(),
  } = opts;

  if (opts.table && !partyFitsTable(opts.table, partySize)) {
    return {
      code: "PARTY_DOES_NOT_FIT",
      message: `Party size ${partySize} does not fit this table`,
    };
  }

  // Filter out the excluded hold so self-conflict is not flagged during confirmation.
  const filteredHolds = holds.filter((h) => {
    if (excludeHoldId !== undefined && h.id === excludeHoldId) return false;
    if (excludeSessionId !== undefined) {
      // Holds don't carry sessionId in the slim shape; this filter is a no-op
      // for the slim type but satisfies the contract — callers that need
      // session exclusion pass pre-filtered slices.
    }
    return true;
  });

  const hasConflict = checkTableConflict(
    tableId,
    startTime,
    endTime,
    opts.reservations,
    filteredHolds,
    now
  );
  if (hasConflict) {
    return { code: "CONFLICT", message: "Table is not available for this time slot" };
  }

  const pacingOk = checkPacingForSlot(
    startTime,
    partySize,
    settings,
    opts.reservations,
    filteredHolds,
    now
  );
  if (!pacingOk) {
    const maxCovers = settings?.pacingRules?.[0]?.maxCoversPerSlot;
    return {
      code: "PACING_EXCEEDED",
      message: `Pacing limit reached. Maximum ${maxCovers} covers per time window.`,
    };
  }

  return undefined;
}

// ── Booking gate: the availability engine's verdict on one booking write ──
// docs/features/venue-availability/architecture.md § Booking gate (ADR-030).

/** Why the gate refused a booking. Rendered by {@link gateProblem}. */
export type GateRejection =
  | { code: "outside-availability"; reason: HardReason; message?: string }
  | { code: "soft-limit"; limits: SoftLimit[] }
  /** The client's `date` is not the service day that owns `start` (ADR-029). */
  | { code: "date-mismatch"; serviceDate: string };

/**
 * `conflict` is a taken table: callers keep their existing conflict answer
 * (409) for it, so the gate adds the availability answers without changing
 * how a double-booking is reported.
 */
export type GateOutcome =
  | { kind: "ok"; overrideLimits?: SoftLimit[] }
  | { kind: "conflict" }
  | { kind: "rejected"; rejection: GateRejection };

export interface GateRequest {
  venueId: string;
  /** Omit to ask whether any table is free (the staff check endpoint). */
  tableId?: string;
  start: Date;
  /**
   * The date the client sent with `start`. When given, it must be the service
   * day that owns `start` (a past-midnight seating belongs to the previous
   * day), else the row would hide from every conflict read keyed on its date.
   */
  serviceDate?: string;
  /** The booking's real end. Without it the engine estimates one from the party size. */
  end?: Date;
  partySize: number;
  /** Guests book `online`; staff create and update are `phone`. Walk-ins are never gated. */
  channel: BookingChannel;
  /** A staff reason to pass a soft limit. Honoured on the phone channel only; closures never yield. */
  override?: { reason: string };
  /** Where the reservation being moved starts now; lets a booking kept through a closure move within its date. */
  movingFrom?: Date;
  /** The reservation being moved; it must not conflict or pace against itself. */
  excludeReservationId?: string;
  /** The hold being confirmed or moved onto. */
  excludeHoldId?: string;
  /** The caller's own session, whose holds a new hold replaces. */
  excludeSessionId?: string;
}

type GateDb = NonNullable<LoadSnapshotOptions["db"]>;

async function excludedHoldIds(db: GateDb, request: GateRequest): Promise<Set<string>> {
  const ids = new Set(request.excludeHoldId ? [request.excludeHoldId] : []);
  if (request.excludeSessionId === undefined) return ids;
  const own = await db.reservationHold.findMany({
    where: { venueId: request.venueId, sessionId: request.excludeSessionId },
    select: { id: true },
  });
  return new Set([...ids, ...own.map((h) => h.id)]);
}

function withoutExcluded(
  snapshot: BookingSnapshot,
  reservationId: string | undefined,
  holdIds: Set<string>
): BookingSnapshot {
  return {
    ...snapshot,
    reservations: snapshot.reservations.filter((r) => r.id !== reservationId),
    holds: snapshot.holds.filter((h) => !holdIds.has(h.id)),
  };
}

/**
 * The single availability check every booking write passes: public hold
 * create, hold confirm (the re-check, so a closure saved after the hold wins),
 * staff create and update, and guest modify.
 *
 * Pass the booking transaction's client so the committed configuration is read
 * inside it (READ COMMITTED). The snapshot comes from the same loader listing
 * uses — including its legacy-hours fallback — so a guest can book exactly what
 * listing offers. It covers the instant's venue-local date D and D−1, because a
 * past-midnight seating belongs to the previous service day (ADR-029).
 */
export async function judgeBooking(
  db: GateDb,
  request: GateRequest,
  now: Date = new Date(),
  logger: SnapshotLogger = CONSOLE_LOGGER
): Promise<GateOutcome> {
  const venue = await db.venue.findUnique({
    where: { id: request.venueId },
    select: { ianaTimezone: true },
  });
  const day = localDateTimeOf(request.start, venue?.ianaTimezone ?? "UTC").date;
  const [loaded, holdIds] = await Promise.all([
    loadAvailabilitySnapshot(request.venueId, addDays(day, -1), day, now, { db }),
    excludedHoldIds(db, request),
  ]);
  const snapshot = withoutExcluded(loaded.snapshot, request.excludeReservationId, holdIds);
  const verdict = judge(
    snapshot,
    {
      start: request.start,
      end: request.end,
      partySize: request.partySize,
      channel: request.channel,
      tableId: request.tableId,
      override: request.override,
      movingFrom: request.movingFrom,
    },
    now
  );
  const staffOnUnsetHours =
    loaded.unconfigured &&
    request.channel === "phone" &&
    verdict.kind === "hard" &&
    verdict.reason === "outside_service";
  const outcome = staffOnUnsetHours
    ? unsetHoursStaffOutcome(snapshot, request, logger)
    : outcomeOf(verdict);
  if (outcome.kind === "rejected") return outcome;
  return dateMismatch(snapshot, request) ?? outcome;
}

/** A rejection when the client's date is not the service day owning the time. */
function dateMismatch(snapshot: BookingSnapshot, request: GateRequest): GateOutcome | null {
  if (request.serviceDate === undefined) return null;
  const local = localDateTimeOf(request.start, snapshot.timezone).date;
  // With no hours configured no service owns the time; accept the local day or the one before.
  const owner = owningServiceDate(snapshot, request.start);
  const accepted = owner === undefined ? [local, addDays(local, -1)] : [owner];
  if (accepted.includes(request.serviceDate)) return null;
  return { kind: "rejected", rejection: { code: "date-mismatch", serviceDate: owner ?? local } };
}

function outcomeOf(verdict: Verdict): GateOutcome {
  switch (verdict.kind) {
    case "ok":
      return { kind: "ok" };
    case "ok_with_override":
      return { kind: "ok", overrideLimits: verdict.limits };
    case "soft":
      return { kind: "rejected", rejection: { code: "soft-limit", limits: verdict.limits } };
    case "hard":
      if (verdict.reason === "conflict") return { kind: "conflict" };
      return outsideAvailability(verdict.reason, verdict.message);
  }
}

function outsideAvailability(reason: HardReason, message?: string): GateOutcome {
  return {
    kind: "rejected",
    rejection: { code: "outside-availability", reason, ...(message ? { message } : {}) },
  };
}

const CONSOLE_LOGGER: SnapshotLogger = {
  warn: (obj, msg) => console.warn(JSON.stringify({ level: "warn", msg, ...obj })),
};

/** A dated rule that stops a phone booking at this table at `minute` of `serviceDate`. */
function blockingBand(
  snapshot: BookingSnapshot,
  serviceDate: string,
  minute: number,
  tableId: string | undefined
): { reason: HardReason; message?: string } | null {
  const day = resolveDay(snapshot, serviceDate);
  const band = day.closures.find(
    (b) =>
      b.from <= minute &&
      minute < b.to &&
      (b.targetKind === "venue" ||
        (b.targetKind === "booking" && (b.bookingTypes ?? []).includes("phone")) ||
        (b.targetKind === "tables" &&
          tableId !== undefined &&
          (b.tableIds ?? []).includes(tableId)))
  );
  if (!band) return null;
  const reason: HardReason =
    band.targetKind === "venue"
      ? "closed"
      : band.targetKind === "booking"
        ? "booking_closed"
        : "table_blocked";
  return { reason, ...(day.guestMessage ? { message: day.guestMessage } : {}) };
}

/**
 * A venue that never set hours has no service for the engine to place a
 * booking in, so listing offers guests nothing. Staff keep taking phone
 * bookings there as before this gate existed — unless a dated rule (a closure,
 * a phone-booking stop, a blocked table) covers the time, which always applies.
 */
function unsetHoursStaffOutcome(
  snapshot: BookingSnapshot,
  request: GateRequest,
  logger: SnapshotLogger
): GateOutcome {
  const local = localDateTimeOf(request.start, snapshot.timezone);
  const block =
    blockingBand(snapshot, local.date, local.minute, request.tableId) ??
    blockingBand(
      snapshot,
      addDays(local.date, -1),
      local.minute + MINUTES_PER_DAY,
      request.tableId
    );
  if (block) return outsideAvailability(block.reason, block.message);
  logger.warn(
    { venueId: request.venueId, tableId: request.tableId, start: request.start.toISOString() },
    "booking_gate_no_hours_staff_allowed"
  );
  return { kind: "ok" };
}

const OUTSIDE_AVAILABILITY_DETAIL: Record<HardReason, string> = {
  closed: "The venue is closed at this time.",
  booking_closed: "Bookings are not being taken for this time.",
  outside_service: "This time is outside the venue's service hours.",
  table_blocked: "This table is not available at this time.",
  table_unavailable: "This table is out of service or too small for the party.",
  conflict: "This table is not available at this time.",
};

const SOFT_LIMIT_DETAIL: Record<SoftLimit, string> = {
  after_last_seating: "after the last seating",
  pacing: "over the pacing limit",
  party_size: "over the maximum party size",
};

/** The human sentence for a {@link GateRejection}, shared by the 422 and the check endpoint. */
export function rejectionDetail(rejection: GateRejection): string {
  if (rejection.code === "outside-availability") {
    return rejection.message ?? OUTSIDE_AVAILABILITY_DETAIL[rejection.reason];
  }
  if (rejection.code === "date-mismatch") {
    return `The date does not match the requested time, which falls on the ${rejection.serviceDate} service day.`;
  }
  return `This booking is ${rejection.limits.map((l) => SOFT_LIMIT_DETAIL[l]).join(" and ")}.`;
}

/** The 422 ProblemDetails (ADR-008) a route sends for a {@link GateRejection}. */
export function gateProblem(rejection: GateRejection): ProblemDetails {
  const detail = rejectionDetail(rejection);
  if (rejection.code === "outside-availability") {
    return createProblemDetails(422, "Outside Availability", detail, "about:blank", undefined, {
      code: rejection.code,
      reason: rejection.reason,
    });
  }
  if (rejection.code === "date-mismatch") {
    return createProblemDetails(422, "Date Mismatch", detail, "about:blank", undefined, {
      code: rejection.code,
      serviceDate: rejection.serviceDate,
    });
  }
  return createProblemDetails(422, "Soft Limit", detail, "about:blank", undefined, {
    code: rejection.code,
    limits: rejection.limits,
  });
}
