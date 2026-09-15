import { useCallback, useRef, useState, type RefObject } from "react";
import type { Reservation, Table } from "@mbe/types";
import { useFocusAfter } from "../../hooks/useFocusAfter.js";
import { describeApiError, type ApiErrorDescription } from "../../lib/describe-api-error.js";
import { STATUS_LABEL } from "../../utils/reservation-display.js";

/**
 * What the detail panel and the phone sheet say about seating (ux.md Screen 5), written once so
 * `ReservationDetails` and `ReservationSheet` cannot drift apart.
 */

/** The reservation's table from the authoritative list — `undefined` reads as "table unknown". */
export function findReservationTable(
  reservation: Reservation,
  tables: readonly Table[]
): Table | undefined {
  return tables.find((table) => table.id === reservation.tableId);
}

/** "Seated" is a fact about the floor (ux Decision a); every other word is the booking's status. */
export function statusWord(reservation: Reservation, seated: boolean): string {
  return seated ? "Seated" : STATUS_LABEL[reservation.status];
}

function isSeatableStatus(reservation: Reservation): boolean {
  return reservation.status === "PENDING" || reservation.status === "CONFIRMED";
}

/** Seat Guest shows when status ∈ {PENDING, CONFIRMED} and the party's table is not OCCUPIED. */
export function canSeat(reservation: Reservation, table: Table | undefined): boolean {
  return isSeatableStatus(reservation) && table?.status !== "OCCUPIED";
}

/**
 * The sentence that explains a missing Seat Guest: the table is OCCUPIED, but not by this party.
 * Null whenever the button is present, or absent for a reason the Host can already see.
 */
export function occupiedCaption(
  reservation: Reservation,
  table: Table | undefined,
  seated: boolean
): string | null {
  if (seated || !isSeatableStatus(reservation) || table?.status !== "OCCUPIED") return null;
  return `${table.name} is still occupied — turn it or move the party.`;
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

/**
 * One seat attempt at a time. A rejected `onSeat` becomes the failure the surface renders; the
 * button returns to rest and focus goes back to it after the commit that re-enables it — a
 * disabled button cannot hold focus, so the request is made through `useFocusAfter` (item 12).
 */
export function useSeatGuest(onSeat: () => Promise<void>): SeatGuestState {
  const [seating, setSeating] = useState(false);
  const [failure, setFailure] = useState<ApiErrorDescription | null>(null);
  const seatRef = useRef<HTMLButtonElement>(null);
  const { focusAfter } = useFocusAfter();

  const seat = useCallback(async () => {
    setSeating(true);
    setFailure(null);
    try {
      await onSeat();
    } catch (err) {
      setFailure(describeApiError(err));
      const element = seatRef.current;
      if (element) focusAfter({ kind: "element", element });
    } finally {
      setSeating(false);
    }
  }, [onSeat, focusAfter]);

  return { seating, failure, seatRef, seat };
}
