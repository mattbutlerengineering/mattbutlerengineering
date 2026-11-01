import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { TFunction } from "i18next";
import type { Reservation, Table } from "@mbe/types";
import { RESERVATION_STATUS_KEYS } from "./status-keys.js";
import { UNLESS_COVERED, useFocusAfter } from "../../hooks/useFocusAfter.js";
import { describeApiError, type ApiErrorDescription } from "../../lib/describe-api-error.js";
import { SEATED_EARLY_WINDOW_MS } from "../../utils/seated.js";
import { isSeatableStatus } from "../../utils/seating.js";

/**
 * What the detail panel and the phone sheet say about seating (ux.md Screen 5), written once so
 * `ReservationDetails` and `ReservationSheet` cannot drift apart.
 */

/** The surfaces' Edit button: always there, so it can hold focus after Seat Guest is gone. */
export const RESERVATION_EDIT_TEST_ID = "reservation-edit";

/** The reservation's table from the authoritative list — `undefined` reads as "table unknown". */
export function findReservationTable(
  reservation: Reservation,
  tables: readonly Table[]
): Table | undefined {
  return tables.find((table) => table.id === reservation.tableId);
}

/** "Seated" is a fact about the floor (ux Decision a); every other word is the booking's status. */
export function statusWord(reservation: Reservation, seated: boolean, t: TFunction): string {
  return t(seated ? "timeline.status.seated" : RESERVATION_STATUS_KEYS[reservation.status]);
}

/**
 * True once an OCCUPIED table's occupant is presumed to be this reservation's own party rather
 * than someone else's — the same CONFIRMED + early-window test `isSeated` (seated.ts) uses, but
 * deliberately with no upper bound at `endTime`. A party running over its slot doesn't hand the
 * table to a stranger (ux #5270); `isSeated` itself keeps the `endTime` clamp so a lingering
 * table that later turns OCCUPIED for the *next* booking still reads as unseated for this one.
 */
function isOccupiedByThisReservation(reservation: Reservation, now: Date): boolean {
  if (reservation.status !== "CONFIRMED") return false;
  const start = new Date(reservation.startTime).getTime();
  const at = now.getTime();
  if (Number.isNaN(start) || Number.isNaN(at)) return false;
  return at >= start - SEATED_EARLY_WINDOW_MS;
}

/**
 * The sentence that explains a missing Seat Guest: the table is OCCUPIED, but not by this party.
 * Null whenever the button is present, or absent for a reason the Host can already see.
 */
export function occupiedCaption(
  reservation: Reservation,
  table: Table | undefined,
  now: Date,
  t: TFunction
): string | null {
  if (!isSeatableStatus(reservation) || table?.status !== "OCCUPIED") return null;
  if (isOccupiedByThisReservation(reservation, now)) return null;
  return t("timeline.details.occupied", { table: table.name });
}

export interface SeatGuestState {
  /** True while `onSeat` is pending — Seat Guest reads "Seating…" and the other actions rest. */
  readonly seating: boolean;
  /** The last rejection, rendered as "Guest not seated." until the next attempt. */
  readonly failure: ApiErrorDescription | null;
  /** Attach to the Seat Guest button so focus can return to it after a failure. */
  readonly seatRef: RefObject<HTMLButtonElement | null>;
  readonly seat: () => Promise<void>;
}

export interface SeatFlights {
  /** True while a seat for this reservation is pending. */
  readonly seating: (reservationId: string) => boolean;
  /** The last rejection for this reservation, while it is the current one. */
  readonly failure: (reservationId: string) => ApiErrorDescription | null;
  /** Sends unless a seat for this reservation is already pending. Rejections become `failure`. */
  readonly run: (reservationId: string, send: () => Promise<void>) => Promise<void>;
}

/**
 * The seats in flight, keyed by reservation. Whoever owns this outlives a surface instance, so a
 * resize mid-seat cannot offer the button again or lose how the seat ended. Only the current
 * reservation keeps a failure: one that lands while another is current is the sender's to report,
 * and showing it there would blame the wrong party.
 */
export function useSeatFlights(currentId: string | null): SeatFlights {
  const [seatingIds, setSeatingIds] = useState<readonly string[]>([]);
  const [failed, setFailed] = useState<{
    readonly id: string;
    readonly description: ApiErrorDescription;
  } | null>(null);
  if (failed && failed.id !== currentId) setFailed(null);

  const inFlightRef = useRef<readonly string[]>([]);
  const currentRef = useRef(currentId);
  useLayoutEffect(() => {
    currentRef.current = currentId;
  });

  const run = useCallback(async (id: string, send: () => Promise<void>) => {
    if (inFlightRef.current.includes(id)) return;
    inFlightRef.current = [...inFlightRef.current, id];
    setSeatingIds(inFlightRef.current);
    setFailed(null);
    try {
      await send();
    } catch (err) {
      if (currentRef.current === id) setFailed({ id, description: describeApiError(err) });
    } finally {
      inFlightRef.current = inFlightRef.current.filter((other) => other !== id);
      setSeatingIds(inFlightRef.current);
    }
  }, []);

  return {
    seating: (id) => seatingIds.includes(id),
    failure: (id) => (failed?.id === id ? failed.description : null),
    run,
  };
}

export interface SeatGuestState {
  /** True while this reservation's seat is pending: Seat Guest reads "Seating…", the rest rest. */
  readonly seating: boolean;
  /** This reservation's last rejection, rendered as "Guest not seated." until the next attempt. */
  readonly failure: ApiErrorDescription | null;
  /** Attach to the Seat Guest button so focus can return to it after a failure. */
  readonly seatRef: RefObject<HTMLButtonElement | null>;
  readonly seat: () => Promise<void>;
}

/**
 * One reservation's seat, from `shared` when the owner passes it. A rejected `onSeat` becomes the
 * failure the surface renders; the button returns to rest and focus goes back to it after the
 * commit that re-enables it, since a disabled button cannot hold focus (item 12), unless a dialog
 * has opened on top by then.
 */
export function useSeatGuest(
  reservationId: string,
  onSeat: () => Promise<void>,
  shared?: SeatFlights
): SeatGuestState {
  const own = useSeatFlights(reservationId);
  const flights = shared ?? own;
  const failure = flights.failure(reservationId);
  const seatRef = useRef<HTMLButtonElement>(null);
  const { focusAfter } = useFocusAfter();

  useEffect(() => {
    const element = seatRef.current;
    if (failure && element) focusAfter({ kind: "element", element }, UNLESS_COVERED);
  }, [failure, focusAfter]);

  return {
    seating: flights.seating(reservationId),
    failure,
    seatRef,
    seat: () => flights.run(reservationId, onSeat),
  };
}
