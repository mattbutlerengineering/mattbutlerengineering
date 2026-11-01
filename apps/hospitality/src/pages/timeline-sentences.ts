import type { TFunction } from "i18next";
import type { Reservation } from "@mbe/types";
import { formatServiceDate } from "../utils/format.js";

/* ── The Timeline's outcome sentences (ux.md § Copy, `role=status` column) ── */

export function walkInSentence(
  created: Reservation,
  tableName: string | undefined,
  t: TFunction
): string {
  const who = created.guestName ? created.guestName : t("timeline.announce.aWalkIn");
  const size = created.partySize;
  return tableName
    ? t("timeline.announce.walkInSeatedAt", { who, size, table: tableName })
    : t("timeline.announce.walkInSeated", { who, size });
}

export function seatedSentence(
  reservation: Reservation,
  tableName: string | undefined,
  t: TFunction
): string {
  const guest = reservation.guestName || t("timeline.announce.theGuest");
  return tableName
    ? t("timeline.announce.seatedAt", { guest, table: tableName })
    : t("timeline.announce.seated", { guest });
}

/** One sentence per named/unnamed case — a possessive cannot be assembled across languages. */
export function cancelledSentence(reservation: Reservation, t: TFunction): string {
  return reservation.guestName
    ? t("timeline.announce.cancelledNamed", { name: reservation.guestName })
    : t("timeline.announce.cancelled");
}

export function noShowSentence(reservation: Reservation, t: TFunction): string {
  return reservation.guestName
    ? t("timeline.announce.noShowNamed", { name: reservation.guestName })
    : t("timeline.announce.noShow");
}

export function savedSentence(reservation: Reservation, t: TFunction): string {
  return reservation.guestName
    ? t("timeline.announce.savedNamed", { name: reservation.guestName })
    : t("timeline.announce.saved");
}

export function loadedSentence(
  date: string,
  todayStr: string,
  locale: string,
  t: TFunction
): string {
  return date === todayStr
    ? t("timeline.announce.loadedTonight")
    : t("timeline.announce.loadedDate", { date: formatServiceDate(date, locale) });
}
