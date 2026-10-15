import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { useUrlParams } from "../hooks/use-url-params.js";
import { useVenueFormat } from "../hooks/useVenueFormat.js";
import { Stack, Text, Card, Button, EmptyState } from "@mattbutlerengineering/rialto";
import { ApiClientError, type ManageReservationData } from "@mbe/api-client";
import { usePublicApiClient } from "../hooks/usePublicApiClient.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { CancelReservationDialog } from "../components/timeline/CancelReservationDialog.js";
import { buildReservationIcs, downloadIcsFile } from "../utils/ics.js";
import { buildGoogleCalendarUrl, buildOutlookCalendarUrl } from "../utils/calendarLinks.js";
import { specialRequestsText } from "../utils/reservation-display.js";
import { WidgetLocaleScope, WidgetLocalePicker } from "../components/booking-widget/index.js";
import styles from "./ManageReservationPage.module.css";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

// A guest arriving from an emailed link has no venue-scoped page to route back
// to (the manage link carries only a token, never a venue slug) — the
// marketing root is the only guest-readable destination this product has, the
// same fallback PublicBookingPage.tsx uses for the same reason (#4978).
const FALLBACK_HOME_URL = "https://mattbutlerengineering.com/";

/** Reservation statuses a guest can still self-service cancel. */
const CANCELLABLE_STATUSES = new Set(["PENDING", "CONFIRMED"]);

// Custom error type to distinguish expired vs invalid
class ManageTokenError extends Error {
  constructor(
    message: string,
    public readonly type: "invalid" | "expired"
  ) {
    super(message);
    this.name = "ManageTokenError";
  }
}

/* ── URL param schema ───────────────────────── */

const manageParamsSchema = z.object({
  token: z.string().default(""),
});

const MANAGE_DEFAULTS = manageParamsSchema.parse({});

/** No-dead-end error surface: every failure state offers a way out, not just prose (#4980). */
function DeadEndRescue({ heading, description }: { heading: string; description: string }) {
  const { t } = useTranslation();
  return (
    <main>
      <Stack align="center" justify="center" style={{ minHeight: "100vh", padding: "2rem" }}>
        <EmptyState
          variant="elevated"
          headingLevel={1}
          heading={heading}
          description={description}
          action={
            <a className={styles.homeLink} href={FALLBACK_HOME_URL}>
              {t("manageReservation.homeLink")}
            </a>
          }
        />
        <Text variant="caption" color="secondary">
          {t("manageReservation.supportLine")}
        </Text>
      </Stack>
    </main>
  );
}

/** Same guest locale scope as the booking page, so a choice made there carries here. */
export function ManageReservationPage() {
  return (
    <WidgetLocaleScope>
      <ManageReservationPageContent />
    </WidgetLocaleScope>
  );
}

function ManageReservationPageContent() {
  const { t } = useTranslation();
  const { params } = useUrlParams(manageParamsSchema, MANAGE_DEFAULTS);
  const token = params.token || null;
  const publicApiClient = usePublicApiClient({ baseUrl: API_BASE, maxRetries: 3 });
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const specialRequestsId = useId();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["manageReservation", token],
    queryFn: async (): Promise<ManageReservationData> => {
      try {
        return await publicApiClient.reservations.manageReservation(token!);
      } catch (err) {
        if (err instanceof ApiClientError && err.statusCode === 410) {
          throw new ManageTokenError("Link expired", "expired");
        }
        throw new ManageTokenError("Invalid link", "invalid");
      }
    },
    enabled: !!token,
    retry: false,
  });

  // Money is never shown here; the venue only supplies the clock.
  const format = useVenueFormat({
    ianaTimezone: data?.venue?.ianaTimezone ?? "",
    currencyCode: "USD",
  });

  // The default title (before the reservation resolves, or on an invalid/expired link)
  // distinguishes this guest surface from a staff-sounding "Dashboard" tab (#4973).
  useDocumentTitle(
    data?.venue
      ? t("manageReservation.venueDocumentTitle", { venue: data.venue.name })
      : t("manageReservation.documentTitle")
  );

  const handleCancelConfirm = async (reason: string, note: string): Promise<void> => {
    await publicApiClient.reservations.cancelManaged(token!, {
      cancellationReason: reason,
      cancellationNote: note,
    });
    await refetch();
    setShowCancelDialog(false);
  };

  // No token in URL
  if (!token) {
    return (
      <DeadEndRescue
        heading={t("manageReservation.noLinkHeading")}
        description={t("manageReservation.noLinkDescription")}
      />
    );
  }

  if (isLoading) {
    return (
      <main>
        <Stack align="center" justify="center" style={{ minHeight: "100vh", padding: "2rem" }}>
          <Text as="h1" variant="body" color="secondary">
            {t("manageReservation.loading")}
          </Text>
        </Stack>
      </main>
    );
  }

  if (error || !data) {
    const errorType = error instanceof ManageTokenError ? error.type : "invalid";

    return (
      <DeadEndRescue
        heading={t(
          errorType === "expired"
            ? "manageReservation.expiredHeading"
            : "manageReservation.invalidHeading"
        )}
        description={t(
          errorType === "expired"
            ? "manageReservation.expiredDescription"
            : "manageReservation.invalidDescription"
        )}
      />
    );
  }

  const { reservation, venue } = data;
  const formattedDate = format.formatLongDateWithYear(reservation.date);
  const formattedStart = format.formatTime(reservation.startTime);
  const formattedEnd = format.formatTime(reservation.endTime);
  const canCancel = CANCELLABLE_STATUSES.has(reservation.status);
  const requests = specialRequestsText(reservation.notes);

  return (
    <main>
      <Stack align="center" style={{ minHeight: "100vh", padding: "2rem" }}>
        <Stack gap="lg" style={{ maxWidth: 600, width: "100%" }}>
          <WidgetLocalePicker />
          <Text as="h1" variant="display">
            {venue ? venue.name : t("manageReservation.fallbackTitle")}
          </Text>

          <Card>
            <Stack gap="md" style={{ padding: "1.5rem" }}>
              <Text as="h2" variant="label">
                {t("manageReservation.detailsTitle")}
              </Text>

              <Stack gap="sm">
                <Stack direction="row" justify="between">
                  <Text variant="body" color="secondary">
                    {t("manageReservation.guest")}
                  </Text>
                  <Text variant="body">{reservation.guestName}</Text>
                </Stack>

                <Stack direction="row" justify="between">
                  <Text variant="body" color="secondary">
                    {t("manageReservation.partySize")}
                  </Text>
                  <Text variant="body">
                    {t("bookingWidget.guests", { count: reservation.partySize })}
                  </Text>
                </Stack>

                <Stack direction="row" justify="between">
                  <Text variant="body" color="secondary">
                    {t("manageReservation.date")}
                  </Text>
                  <Text variant="body">{formattedDate}</Text>
                </Stack>

                <Stack direction="row" justify="between">
                  <Text variant="body" color="secondary">
                    {t("manageReservation.time")}
                  </Text>
                  <Text variant="body">
                    {t("manageReservation.timeRange", { start: formattedStart, end: formattedEnd })}
                  </Text>
                </Stack>
              </Stack>
            </Stack>
          </Card>

          {requests !== null && (
            <Card role="group" aria-labelledby={specialRequestsId}>
              <Stack gap="md" className={styles.cardInset}>
                <Text as="h2" id={specialRequestsId} variant="label" color="secondary">
                  {t("bookingWidget.specialRequests.label")}
                </Text>
                <Stack gap="sm">
                  <Text variant="body" color="secondary">
                    {t("bookingWidget.specialRequests.acknowledgement")}
                  </Text>
                  <Text variant="body" dir="auto" className={styles.requestsText}>
                    {requests}
                  </Text>
                </Stack>
              </Stack>
            </Card>
          )}

          {venue && (
            <Card>
              <Stack gap="md" style={{ padding: "1.5rem" }}>
                <Text as="h2" variant="label">
                  {t("bookingWidget.calendar.title")}
                </Text>
                <div className={styles.calendarActions}>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      downloadIcsFile(
                        buildReservationIcs(reservation, venue),
                        `reservation-${reservation.id.slice(-8)}.ics`
                      )
                    }
                  >
                    {t("bookingWidget.calendar.downloadIcs")}
                  </Button>
                  <a
                    className={styles.calendarLink}
                    href={buildGoogleCalendarUrl(reservation, venue)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("bookingWidget.calendar.google")}
                  </a>
                  <a
                    className={styles.calendarLink}
                    href={buildOutlookCalendarUrl(reservation, venue)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("bookingWidget.calendar.outlook")}
                  </a>
                </div>
              </Stack>
            </Card>
          )}

          <Stack gap="sm">
            {venue?.phone && (
              <a className={styles.callLink} href={`tel:${venue.phone}`}>
                {t("manageReservation.call", { venue: venue.name })}
              </a>
            )}
            {canCancel ? (
              <Button variant="ghost" onClick={() => setShowCancelDialog(true)}>
                {t("manageReservation.cancel")}
              </Button>
            ) : (
              reservation.status === "CANCELLED" && (
                <Text variant="caption" color="secondary" align="center">
                  {t("manageReservation.cancelled")}
                </Text>
              )
            )}
          </Stack>
        </Stack>

        {showCancelDialog && (
          <CancelReservationDialog
            reservationId={reservation.id}
            guestName={reservation.guestName}
            onConfirm={handleCancelConfirm}
            onClose={() => setShowCancelDialog(false)}
          />
        )}
      </Stack>
    </main>
  );
}
