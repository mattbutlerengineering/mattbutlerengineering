import { Button, Text } from "@mattbutlerengineering/rialto";
import type { Reservation, PublicVenueConfig } from "@mbe/types";
import { formatLongDateWithYear, formatTime, formatCurrencyFromCents } from "../../utils/format.js";
import { buildReservationIcs } from "../../utils/ics.js";
import { buildGoogleCalendarUrl, buildOutlookCalendarUrl } from "../../utils/calendarLinks.js";
import styles from "./ConfirmationView.module.css";

export interface ConfirmationViewProps {
  reservation: Reservation;
  onNewBooking: () => void;
  cancellationUrl?: string;
  onCancellation?: () => void;
  depositAmountCents?: number | null;
  depositCurrency?: string | null;
  cancellationPolicySummary?: string | null;
  /**
   * The booking venue's public config (name + ianaTimezone). Powers the
   * "Add to calendar" section — omitted/null hides the section entirely
   * rather than guessing a timezone.
   */
  venueConfig?: PublicVenueConfig | null;
}

/** Builds the .ics blob client-side and triggers a same-tab file download — no server round-trip. */
function downloadReservationIcs(
  reservation: Reservation,
  venueConfig: PublicVenueConfig,
  cancellationUrl?: string
): void {
  const icsContent = buildReservationIcs(reservation, venueConfig, { cancellationUrl });
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `reservation-${reservation.id.slice(-8)}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function ConfirmationView({
  reservation,
  onNewBooking,
  cancellationUrl,
  onCancellation,
  depositAmountCents,
  depositCurrency,
  cancellationPolicySummary,
  venueConfig,
}: ConfirmationViewProps) {
  const formattedDate = formatLongDateWithYear(reservation.date);
  const formattedTime = formatTime(reservation.startTime);

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
          Reservation Confirmed!
        </Text>
        <Text variant="caption" color="secondary" align="center">
          We look forward to seeing you.
        </Text>
      </div>

      {/* Reservation details */}
      <div className={styles.detailsCard}>
        <Text variant="label" as="h3" className={styles.detailsTitle}>
          Reservation Details
        </Text>
        <dl className={styles.detailsList}>
          <div className={styles.detailRow}>
            <Text variant="caption" color="secondary" as="dt">
              Confirmation #
            </Text>
            <Text variant="caption" as="dd" mono>
              {reservation.id.slice(-8).toUpperCase()}
            </Text>
          </div>
          <div className={styles.detailRow}>
            <Text variant="caption" color="secondary" as="dt">
              Date
            </Text>
            <Text variant="caption" as="dd">
              {formattedDate}
            </Text>
          </div>
          <div className={styles.detailRow}>
            <Text variant="caption" color="secondary" as="dt">
              Time
            </Text>
            <Text variant="caption" as="dd">
              {formattedTime}
            </Text>
          </div>
          <div className={styles.detailRow}>
            <Text variant="caption" color="secondary" as="dt">
              Party Size
            </Text>
            <Text variant="caption" as="dd">
              {reservation.partySize} {reservation.partySize === 1 ? "guest" : "guests"}
            </Text>
          </div>
          {reservation.guestName && (
            <div className={styles.detailRow}>
              <Text variant="caption" color="secondary" as="dt">
                Name
              </Text>
              <Text variant="caption" as="dd">
                {reservation.guestName}
              </Text>
            </div>
          )}
          {reservation.table && (
            <div className={styles.detailRow}>
              <Text variant="caption" color="secondary" as="dt">
                Table
              </Text>
              <Text variant="caption" as="dd">
                {reservation.table.tableNumber || reservation.table.name}
              </Text>
            </div>
          )}
        </dl>
      </div>

      {/* Deposit authorization notice */}
      {depositAmountCents != null && depositAmountCents > 0 && (
        <div className={styles.detailsCard}>
          <Text variant="label" as="h3" className={styles.detailsTitle}>
            Deposit
          </Text>
          <Text variant="caption" color="secondary">
            Your card has been authorized for{" "}
            {formatCurrencyFromCents(depositAmountCents, depositCurrency ?? "usd")}. The hold will
            be released or captured based on your cancellation timeline.
          </Text>
        </div>
      )}

      {/* Cancellation policy summary */}
      {cancellationPolicySummary && (
        <div className={styles.detailsCard}>
          <Text variant="label" as="h3" className={styles.detailsTitle}>
            Cancellation Policy
          </Text>
          <Text variant="caption" color="secondary">
            {cancellationPolicySummary}
          </Text>
        </div>
      )}

      {/* Contact info note */}
      {(reservation.guestEmail || reservation.guestPhone) && (
        <Text variant="caption" color="secondary" align="center">
          A confirmation has been sent to {reservation.guestEmail || reservation.guestPhone}.
        </Text>
      )}

      {/* Add to calendar — hidden until venue config (name + timezone) is available */}
      {venueConfig && (
        <div className={styles.detailsCard}>
          <Text variant="label" as="h3" className={styles.detailsTitle}>
            Add to Calendar
          </Text>
          <div className={styles.calendarActions}>
            <Button
              variant="secondary"
              onClick={() => downloadReservationIcs(reservation, venueConfig, cancellationUrl)}
            >
              Download .ics
            </Button>
            <a
              href={buildGoogleCalendarUrl(reservation, venueConfig, { cancellationUrl })}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.calendarLink}
            >
              Google Calendar
            </a>
            <a
              href={buildOutlookCalendarUrl(reservation, venueConfig, { cancellationUrl })}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.calendarLink}
            >
              Outlook
            </a>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className={styles.actions}>
        {(cancellationUrl || onCancellation) && (
          <Button
            variant="ghost"
            onClick={() => {
              if (onCancellation) {
                onCancellation();
              }
              if (cancellationUrl) {
                window.location.href = cancellationUrl;
              }
            }}
            className={styles.fullWidth}
          >
            Cancel Reservation
          </Button>
        )}
        <Button variant="secondary" onClick={onNewBooking} className={styles.fullWidth}>
          Make Another Reservation
        </Button>
      </div>
    </div>
  );
}
