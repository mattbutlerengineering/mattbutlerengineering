import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useUrlParams } from "../hooks/use-url-params.js";
import { Stack, Text, Card, Button, EmptyState } from "@mattbutlerengineering/rialto";
import { ApiClientError, type ManageReservationData } from "@mbe/api-client";
import { usePublicApiClient } from "../hooks/usePublicApiClient.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { CancelReservationDialog } from "../components/timeline/CancelReservationDialog.js";
import { formatLongDateWithYear, formatTime, formatTimeIn } from "../utils/format.js";
import { buildReservationIcs, downloadIcsFile } from "../utils/ics.js";
import { buildGoogleCalendarUrl, buildOutlookCalendarUrl } from "../utils/calendarLinks.js";
import styles from "./ManageReservationPage.module.css";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

/** Default title before the reservation resolves (or on an invalid/expired link) — distinguishes this guest surface from a staff-sounding "Dashboard" tab (#4973). */
const DEFAULT_TITLE = "Your reservation — Hospitality";

// A guest arriving from an emailed link has no venue-scoped page to route back
// to (the manage link carries only a token, never a venue slug) — the
// marketing root is the only guest-readable destination this product has, the
// same fallback PublicBookingPage.tsx uses for the same reason (#4978).
const FALLBACK_HOME_URL = "https://mattbutlerengineering.com/";
const SUPPORT_LINE =
  "Need help? Contact the venue directly using the details in your confirmation email.";

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
  return (
    <Stack align="center" justify="center" style={{ minHeight: "100vh", padding: "2rem" }}>
      <EmptyState
        variant="elevated"
        heading={heading}
        description={description}
        action={
          <a className={styles.homeLink} href={FALLBACK_HOME_URL}>
            Back to Matt Butler Engineering
          </a>
        }
      />
      <Text variant="caption" color="secondary">
        {SUPPORT_LINE}
      </Text>
    </Stack>
  );
}

export function ManageReservationPage() {
  const { params } = useUrlParams(manageParamsSchema, MANAGE_DEFAULTS);
  const token = params.token || null;
  const publicApiClient = usePublicApiClient({ baseUrl: API_BASE, maxRetries: 3 });
  const [showCancelDialog, setShowCancelDialog] = useState(false);

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

  useDocumentTitle(data?.venue ? `${data.venue.name} — Your reservation` : DEFAULT_TITLE);

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
        heading="No Access Link"
        description="Please check the link in your confirmation email."
      />
    );
  }

  if (isLoading) {
    return (
      <Stack align="center" justify="center" style={{ minHeight: "100vh", padding: "2rem" }}>
        <Text variant="body" color="secondary">
          Loading reservation...
        </Text>
      </Stack>
    );
  }

  if (error || !data) {
    const errorType = error instanceof ManageTokenError ? error.type : "invalid";

    return (
      <DeadEndRescue
        heading={errorType === "expired" ? "Link Expired" : "Invalid Link"}
        description={
          errorType === "expired"
            ? "This manage link has expired. Please contact the venue for assistance."
            : "This link has already been used or is invalid."
        }
      />
    );
  }

  const { reservation, venue } = data;
  const formattedDate = formatLongDateWithYear(reservation.date);
  const formattedStart = venue
    ? formatTimeIn(reservation.startTime, venue.ianaTimezone)
    : formatTime(reservation.startTime);
  const formattedEnd = venue
    ? formatTimeIn(reservation.endTime, venue.ianaTimezone)
    : formatTime(reservation.endTime);
  const canCancel = CANCELLABLE_STATUSES.has(reservation.status);

  return (
    <Stack align="center" style={{ minHeight: "100vh", padding: "2rem" }}>
      <Stack gap="lg" style={{ maxWidth: 600, width: "100%" }}>
        {venue && (
          <Text as="h1" variant="display">
            {venue.name}
          </Text>
        )}

        <Card>
          <Stack gap="md" style={{ padding: "1.5rem" }}>
            <Text as="h2" variant="label">
              Reservation Details
            </Text>

            <Stack gap="sm">
              <Stack direction="row" justify="between">
                <Text variant="body" color="secondary">
                  Guest
                </Text>
                <Text variant="body">{reservation.guestName}</Text>
              </Stack>

              <Stack direction="row" justify="between">
                <Text variant="body" color="secondary">
                  Party Size
                </Text>
                <Text variant="body">{reservation.partySize} guests</Text>
              </Stack>

              <Stack direction="row" justify="between">
                <Text variant="body" color="secondary">
                  Date
                </Text>
                <Text variant="body">{formattedDate}</Text>
              </Stack>

              <Stack direction="row" justify="between">
                <Text variant="body" color="secondary">
                  Time
                </Text>
                <Text variant="body">
                  {formattedStart} – {formattedEnd}
                </Text>
              </Stack>

              {reservation.notes && (
                <Stack direction="row" justify="between">
                  <Text variant="body" color="secondary">
                    Special Requests
                  </Text>
                  <Text variant="body">{reservation.notes}</Text>
                </Stack>
              )}
            </Stack>
          </Stack>
        </Card>

        {venue && (
          <Card>
            <Stack gap="md" style={{ padding: "1.5rem" }}>
              <Text as="h2" variant="label">
                Add to Calendar
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
                  Download .ics
                </Button>
                <a
                  className={styles.calendarLink}
                  href={buildGoogleCalendarUrl(reservation, venue)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Google Calendar
                </a>
                <a
                  className={styles.calendarLink}
                  href={buildOutlookCalendarUrl(reservation, venue)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Outlook
                </a>
              </div>
            </Stack>
          </Card>
        )}

        <Stack gap="sm">
          {venue?.phone && (
            <a className={styles.callLink} href={`tel:${venue.phone}`}>
              Call {venue.name}
            </a>
          )}
          {canCancel ? (
            <Button variant="ghost" onClick={() => setShowCancelDialog(true)}>
              Cancel Reservation
            </Button>
          ) : (
            reservation.status === "CANCELLED" && (
              <Text variant="caption" color="secondary" align="center">
                This reservation has been cancelled.
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
  );
}
