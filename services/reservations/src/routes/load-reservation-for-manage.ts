import type { Reservation } from "@mbe/types";
import { reservationService } from "../services/reservation.js";

export type ManagePreambleResult =
  | { ok: true; reservation: Reservation }
  | { ok: false; status: 404; reason: "not_found" }
  | { ok: false; status: 409; reason: "cancelled" | "completed" };

/**
 * Shared preamble for the manage-token routes (cancel, modify): load the
 * reservation by id and guard against terminal states. Both routes need the
 * same load → 404-if-missing → 409-if-CANCELLED → 409-if-COMPLETED sequence;
 * only the reply body text differs, which callers supply themselves by
 * switching on `reason`.
 */
export async function loadReservationForManage(id: string): Promise<ManagePreambleResult> {
  const reservation = await reservationService.getById(id);
  if (!reservation) {
    return { ok: false, status: 404, reason: "not_found" };
  }
  if (reservation.status === "CANCELLED") {
    return { ok: false, status: 409, reason: "cancelled" };
  }
  if (reservation.status === "COMPLETED") {
    return { ok: false, status: 409, reason: "completed" };
  }
  return { ok: true, reservation };
}
