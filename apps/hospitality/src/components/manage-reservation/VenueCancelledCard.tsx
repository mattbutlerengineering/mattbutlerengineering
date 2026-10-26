import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Stack, Text } from "@mattbutlerengineering/rialto";
import { ApiClientError, type ManagedVenueCancellation } from "@mbe/api-client";
import { usePublicApiClient } from "../../hooks/usePublicApiClient.js";
import styles from "./VenueCancelledCard.module.css";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

/** The rebook route answers 409 for a taken or already-rebooked slot, 422 when the gate or a deposit refuses. */
const TAKEN_STATUSES = new Set([409, 422]);

type Notice = "taken" | "failed" | null;

export interface VenueCancelledCardProps {
  venue: { name: string; slug: string; phone?: string };
  /** The manage token the page was opened with; authorises the rebook. */
  token: string;
  cancellation: ManagedVenueCancellation;
  format: {
    formatTime(isoString: string): string;
    formatCalendarDate(dateStr: string, options: Intl.DateTimeFormatOptions): string;
    formatInstant(value: string, options: Intl.DateTimeFormatOptions): string;
  };
  /** Re-reads the manage payload so the offers reflect what is open now. */
  onRefresh(): Promise<unknown>;
  /** Receives the new reservation's manage token. */
  onRebooked(manageToken: string): void;
  /** The offer a `rebook=` manage link pointed at; flagged when it is no longer open. */
  preferredOfferId?: string;
}

const DATE_FIELDS: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
};

const DATE_TIME_FIELDS: Intl.DateTimeFormatOptions = {
  ...DATE_FIELDS,
  hour: "numeric",
  minute: "2-digit",
};

/**
 * The manage page for a booking a venue closure cancelled: what happened to the
 * deposit, up to 3 one-tap rebooks, and a way to the full picker. A tap asks the
 * server to rebook (it re-checks the slot through the booking gate and keeps the
 * guest's own details); a refused or taken slot refreshes the list instead. Once
 * rebooked the card links to the new reservation and offers nothing more.
 */
export function VenueCancelledCard({
  venue,
  token,
  cancellation,
  format,
  onRefresh,
  onRebooked,
  preferredOfferId,
}: VenueCancelledCardProps) {
  const { t } = useTranslation();
  const api = usePublicApiClient({ baseUrl: API_BASE });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const { offers, refundStatus, rebooked } = cancellation;
  const preferredMissing =
    preferredOfferId !== undefined &&
    preferredOfferId !== "" &&
    !rebooked &&
    !offers.some((o) => o.id === preferredOfferId);
  const shownNotice: Notice = notice ?? (preferredMissing ? "taken" : null);

  const rebook = async (offer: ManagedVenueCancellation["offers"][number]): Promise<void> => {
    setBusyId(offer.id);
    setNotice(null);
    try {
      const result = await api.reservations.rebookManaged(token, offer.id);
      onRebooked(result.manageToken);
    } catch (err) {
      if (err instanceof ApiClientError && TAKEN_STATUSES.has(err.statusCode)) {
        setNotice("taken");
        await onRefresh();
      } else {
        setNotice("failed");
      }
    } finally {
      setBusyId(null);
    }
  };

  const pickerHref = `${import.meta.env.BASE_URL}book/${venue.slug}`;

  return (
    <Card>
      <Stack gap="md" className={styles.inset}>
        <Text as="h2" variant="label">
          {t("manageReservation.venueCancelled.heading")}
        </Text>
        <Text variant="body" color="secondary">
          {t("manageReservation.venueCancelled.closedOn", {
            venue: venue.name,
            date: format.formatCalendarDate(cancellation.closureDate, DATE_FIELDS),
          })}
        </Text>
        {cancellation.closureMessage && (
          <Text variant="body" dir="auto">
            {t("manageReservation.venueCancelled.message", {
              message: cancellation.closureMessage,
            })}
          </Text>
        )}
        {refundStatus !== "none" && (
          <Text variant="body">
            {t(`manageReservation.venueCancelled.refund.${refundStatus}`, { venue: venue.name })}
          </Text>
        )}

        {shownNotice !== null && (
          <Alert variant="warning">
            {t(`manageReservation.venueCancelled.notice.${shownNotice}`)}
          </Alert>
        )}

        {rebooked ? (
          <Stack gap="sm">
            <Text variant="body">
              {t("manageReservation.venueCancelled.rebooked", {
                when: format.formatInstant(rebooked.startTime, DATE_TIME_FIELDS),
              })}
            </Text>
            <a
              className={styles.otherDates}
              href={`?token=${encodeURIComponent(rebooked.manageToken)}`}
            >
              {t("manageReservation.venueCancelled.viewRebooked")}
            </a>
          </Stack>
        ) : offers.length > 0 ? (
          <Stack gap="sm">
            <Text as="h3" variant="label" color="secondary">
              {t("manageReservation.venueCancelled.rebookHeading")}
            </Text>
            {offers.map((offer) => (
              <Button
                key={offer.id}
                variant={offer.id === preferredOfferId ? "primary" : "secondary"}
                disabled={busyId !== null}
                isLoading={busyId === offer.id}
                loadingText={t("manageReservation.venueCancelled.rebooking")}
                onClick={() => void rebook(offer)}
              >
                {t("manageReservation.venueCancelled.rebook", {
                  date: format.formatCalendarDate(offer.date, DATE_FIELDS),
                  time: format.formatTime(offer.startTime),
                })}
              </Button>
            ))}
          </Stack>
        ) : (
          <Text variant="body" color="secondary">
            {t("manageReservation.venueCancelled.noOffers")}
          </Text>
        )}

        {!rebooked && (
          <a className={styles.otherDates} href={pickerHref}>
            {t("manageReservation.venueCancelled.otherDates")}
          </a>
        )}
      </Stack>
    </Card>
  );
}
