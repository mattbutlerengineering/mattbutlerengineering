import type { TFunction } from "i18next";
import type { Reservation } from "@mbe/types";

export type LiveToastEvent = "reservation:created" | "reservation:cancelled";

/** Title and description for a live-sync reservation toast, in the active locale. */
export function liveReservationToast(
  type: LiveToastEvent,
  reservation: Reservation,
  t: TFunction,
  formatTime: (iso: string) => string
): { title: string; description: string } {
  const name = reservation.guestName ?? t("reservations.guestFallback");
  if (type === "reservation:created") {
    return {
      title: t("reservations.live.createdTitle"),
      description: t("reservations.live.createdDescription", {
        name,
        time: formatTime(reservation.startTime),
      }),
    };
  }
  return {
    title: t("reservations.live.cancelledTitle"),
    description: t("reservations.live.cancelledDescription", { name }),
  };
}
