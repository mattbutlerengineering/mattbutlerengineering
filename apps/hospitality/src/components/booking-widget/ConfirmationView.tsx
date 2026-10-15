import { useId } from "react";
import { Button, Stack, Text } from "@mattbutlerengineering/rialto";
import type { Reservation, PublicVenueConfig } from "@mbe/types";
import { useTranslation } from "react-i18next";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { buildReservationIcs, downloadIcsFile } from "../../utils/ics.js";
import { buildGoogleCalendarUrl, buildOutlookCalendarUrl } from "../../utils/calendarLinks.js";
import { specialRequestsText } from "../../utils/reservation-display.js";
import styles from "./ConfirmationView.module.css";

export interface ConfirmationViewProps {
  reservation: Reservation;
  onNewBooking: () => void;
  cancellationUrl?: string;
  depositAmountCents?: number | null;
  depositCurrency?: string | null;
  cancellationPolicySummary?: string | null;
  /**
   * The booking venue's public config (name + ianaTimezone). Powers the
   * "Add to calendar" section — omitted/null hides the section entirely
   * rather than guessing a timezone.
   */
  venueConfig?: PublicVenueConfig | null;
  /**
   * IANA timezone to display the reservation time in. Falls back to
   * `venueConfig.ianaTimezone`, then device-local, if omitted (#4976).
   */
  venueTimezone?: string;
}

/** Builds the .ics content and triggers a same-tab file download. */
function downloadReservationIcs(
  reservation: Reservation,
  venueConfig: PublicVenueConfig,
  cancellationUrl?: string
): void {
  const icsContent = buildReservationIcs(reservation, venueConfig, { cancellationUrl });
  downloadIcsFile(icsContent, `reservation-${reservation.id.slice(-8)}.ics`);
}

export function ConfirmationView({
  reservation,
  onNewBooking,
  cancellationUrl,
  depositAmountCents,
  depositCurrency,
  cancellationPolicySummary,
  venueConfig,
  venueTimezone,
}: ConfirmationViewProps) {
  const specialRequestsId = useId();
  const requests = specialRequestsText(reservation.notes);
  const contact = reservation.guestEmail || reservation.guestPhone;
  const { t } = useTranslation();
  const format = useVenueFormat({
    ianaTimezone: venueTimezone ?? venueConfig?.ianaTimezone ?? "",
    currencyCode: depositCurrency ?? "usd",
  });
  const formattedDate = format.formatLongDateWithYear(reservation.date);
  const formattedTime = format.formatTime(reservation.startTime);

  return (
    <div className={styles.container}>
      {/* Success icon with animation */}
      <div className={styles.iconWrapper}>
        <div className={styles.accentBurst} aria-hidden="true">
          <Text className={styles.burstDot} />
          <Text className={styles.burstDot} />
          <Text className={styles.burstDot} />
          <Text className={styles.burstDot} />
        </div>
        <svg
          className={styles.icon}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            className={styles.checkPath}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>

      <div>
        <Text variant="display" as="h2" align="center">
          {t("bookingWidget.confirmation.title")}
        </Text>
        <Text variant="caption" color="secondary" align="center">
          {t("bookingWidget.confirmation.subtitle")}
        </Text>
      </div>

      {/* Reservation details */}
      <div className={styles.detailsCard}>
        <Text variant="label" as="h3" className={styles.detailsTitle}>
          {t("bookingWidget.confirmation.detailsTitle")}
        </Text>
        <dl className={styles.detailsList}>
          <div className={styles.detailRow}>
            <Text variant="caption" color="secondary" as="dt">
              {t("bookingWidget.confirmation.confirmationNumber")}
            </Text>
            <Text variant="caption" as="dd" mono>
              {reservation.id.slice(-8).toUpperCase()}
            </Text>
          </div>
          <div className={styles.detailRow}>
            <Text variant="caption" color="secondary" as="dt">
              {t("bookingWidget.confirmation.date")}
            </Text>
            <Text variant="caption" as="dd">
              {formattedDate}
            </Text>
          </div>
          <div className={styles.detailRow}>
            <Text variant="caption" color="secondary" as="dt">
              {t("bookingWidget.confirmation.time")}
            </Text>
            <Text variant="caption" as="dd">
              {formattedTime}
            </Text>
          </div>
          <div className={styles.detailRow}>
            <Text variant="caption" color="secondary" as="dt">
              {t("bookingWidget.confirmation.partySize")}
            </Text>
            <Text variant="caption" as="dd">
              {t("bookingWidget.guests", { count: reservation.partySize })}
            </Text>
          </div>
          {reservation.guestName && (
            <div className={styles.detailRow}>
              <Text variant="caption" color="secondary" as="dt">
                {t("bookingWidget.confirmation.name")}
              </Text>
              <Text variant="caption" as="dd">
                {reservation.guestName}
              </Text>
            </div>
          )}
          {reservation.table && (
            <div className={styles.detailRow}>
              <Text variant="caption" color="secondary" as="dt">
                {t("bookingWidget.confirmation.table")}
              </Text>
              <Text variant="caption" as="dd">
                {reservation.table.tableNumber || reservation.table.name}
              </Text>
            </div>
          )}
        </dl>
      </div>

      {/* Special Requests, said back verbatim */}
      {requests !== null && (
        <div className={styles.detailsCard} role="group" aria-labelledby={specialRequestsId}>
          <Text
            id={specialRequestsId}
            variant="label"
            as="h3"
            color="secondary"
            className={styles.detailsTitle}
          >
            {t("bookingWidget.specialRequests.label")}
          </Text>
          <Stack gap="sm">
            <Text variant="caption" color="secondary">
              {t("bookingWidget.specialRequests.acknowledgement")}
            </Text>
            <Text variant="caption" color="primary" dir="auto" className={styles.requestsText}>
              {requests}
            </Text>
          </Stack>
        </div>
      )}

      {/* Deposit authorization notice */}
      {depositAmountCents != null && depositAmountCents > 0 && (
        <div className={styles.detailsCard}>
          <Text variant="label" as="h3" className={styles.detailsTitle}>
            {t("bookingWidget.confirmation.deposit")}
          </Text>
          <Text variant="caption" color="secondary">
            {t("bookingWidget.confirmation.depositNotice", {
              amount: format.formatMoney(depositAmountCents),
            })}
          </Text>
        </div>
      )}

      {/* Cancellation policy summary */}
      {cancellationPolicySummary && (
        <div className={styles.detailsCard}>
          <Text variant="label" as="h3" className={styles.detailsTitle}>
            {t("bookingWidget.confirmation.cancellationPolicy")}
          </Text>
          <Text variant="caption" color="secondary">
            {cancellationPolicySummary}
          </Text>
        </div>
      )}

      {/* Contact info note */}
      {contact && (
        <Text variant="caption" color="secondary" align="center" className={styles.contactLine}>
          {t("bookingWidget.confirmation.contactLine", { contact })}
        </Text>
      )}

      {/* Add to calendar — hidden until venue config (name + timezone) is available */}
      {venueConfig && (
        <div className={styles.detailsCard}>
          <Text variant="label" as="h3" className={styles.detailsTitle}>
            {t("bookingWidget.calendar.title")}
          </Text>
          <div className={styles.calendarActions}>
            <Button
              variant="secondary"
              onClick={() => downloadReservationIcs(reservation, venueConfig, cancellationUrl)}
            >
              {t("bookingWidget.calendar.downloadIcs")}
            </Button>
            <a
              href={buildGoogleCalendarUrl(reservation, venueConfig, { cancellationUrl })}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.calendarLink}
            >
              {t("bookingWidget.calendar.google")}
            </a>
            <a
              href={buildOutlookCalendarUrl(reservation, venueConfig, { cancellationUrl })}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.calendarLink}
            >
              {t("bookingWidget.calendar.outlook")}
            </a>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className={styles.actions}>
        {cancellationUrl && (
          <Button
            variant="ghost"
            onClick={() => {
              window.location.href = cancellationUrl;
            }}
            className={styles.fullWidth}
          >
            {t("bookingWidget.confirmation.cancel")}
          </Button>
        )}
        <Button variant="secondary" onClick={onNewBooking} className={styles.fullWidth}>
          {t("bookingWidget.confirmation.another")}
        </Button>
      </div>
    </div>
  );
}
