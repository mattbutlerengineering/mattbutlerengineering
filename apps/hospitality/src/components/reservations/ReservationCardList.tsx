import { useTranslation } from "react-i18next";
import type { Reservation } from "@mbe/types";
import { Badge, Button, Card, Heading, Text } from "@mattbutlerengineering/rialto";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { ordinalVisitLabel } from "../../i18n/ordinal-visit.js";
import { STATUS_BADGE_VARIANT, formatReservationTime } from "../../utils/reservation-display.js";
import styles from "./ReservationCardList.module.css";

export interface ReservationCardListProps {
  /** Already filtered and sorted — the cards render in the order given, like the table rows. */
  reservations: readonly Reservation[];
  /** The page's table-name resolver, so cards and table never disagree (#4986). */
  tableNameFor: (reservation: Reservation) => string;
  onView: (reservation: Reservation) => void;
}

/**
 * The phone layout of the reservations list (#10060): one card per booking, so a host sees
 * time, guest, party, table, status and View inside a 375px screen with no sideways scroll.
 */
export function ReservationCardList({
  reservations,
  tableNameFor,
  onView,
}: ReservationCardListProps) {
  const { t, i18n } = useTranslation();
  const fmt = useVenueFormat();

  return (
    <ul className={styles.list} aria-label={t("reservations.title")}>
      {reservations.map((reservation) => {
        const guestName = reservation.guestName ?? t("reservations.guestFallback");
        const visitCount = reservation.guest?.visitCount ?? 0;
        return (
          <li key={reservation.id}>
            <Card>
              <div className={styles.card}>
                <Heading level={2} size={6} className={styles.heading}>
                  {/* Spans, not Text's default <p>: a heading holds phrasing content only.
                      The module CSS lets the Heading's type win over Text's variant. */}
                  <Text as="span" className={styles.time}>
                    {formatReservationTime(reservation.startTime, fmt.locale, fmt.timeZone)} -{" "}
                    {formatReservationTime(reservation.endTime, fmt.locale, fmt.timeZone)}
                  </Text>{" "}
                  <Text as="span" className={styles.guest}>
                    {guestName}
                  </Text>
                </Heading>
                <div className={styles.details}>
                  <Text variant="body" color="secondary">
                    {t("reservations.partyOf", { size: reservation.partySize })}
                  </Text>
                  <Text variant="body" color="secondary">
                    {tableNameFor(reservation)}
                  </Text>
                  <Badge variant={STATUS_BADGE_VARIANT[reservation.status]}>
                    {t(`reservations.status.${reservation.status}`)}
                  </Badge>
                  {visitCount > 1 && (
                    <Badge variant="accent" size="sm">
                      {ordinalVisitLabel(t, i18n.language, visitCount)}
                    </Badge>
                  )}
                </div>
                {reservation.notes && (
                  <Text variant="caption" color="secondary" className={styles.notes}>
                    {reservation.notes}
                  </Text>
                )}
                <Button
                  variant="secondary"
                  className={styles.view}
                  onClick={() => onView(reservation)}
                  aria-label={t("reservations.viewAria", { name: guestName })}
                >
                  {t("reservations.view")}
                </Button>
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
