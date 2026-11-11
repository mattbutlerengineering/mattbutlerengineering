import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Stack, Text } from "@mattbutlerengineering/rialto";
import { ApiClientError, type GuestSignal, type ManagedVenueAddress } from "@mbe/api-client";
import { usePublicApiClient } from "../../hooks/usePublicApiClient.js";
import { buildDirectionsUrl } from "../../utils/directions-url.js";
import { formatDurationLabel } from "../../utils/format.js";
import { guestSignalAvailability, MAX_LATE_SIGNALS } from "../../utils/guest-signal.js";
import styles from "./NightOfCard.module.css";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

/** The one delay the "Running late" button offers (the server accepts 5, 15 or 30). */
const LATE_MINUTES = 15;

/** Within this many ms of the start the countdown reads "now" rather than "in 0 min". */
const NOW_WINDOW_MS = 60_000;

type SignalCounts = { late: number; arrived: number };
type SignalError = "link" | "expired" | "window" | "limit" | "failed";

export interface NightOfCardProps {
  /** The manage token the page was opened with; authorises the signal. */
  token: string;
  reservation: { startTime: string; partySize: number; status: string };
  venue: {
    name: string;
    ianaTimezone: string;
    address?: ManagedVenueAddress;
    tonightNote?: string;
  };
  /** Signals already sent, from the manage payload. */
  initialSignals: SignalCounts;
  /** Ticking clock owned by the page, so the countdown and the button window stay current. */
  now: Date;
  formatTime(isoString: string): string;
}

/** Server refusals the guest can act on, by HTTP status (`routes/manage-signal.ts`, `manage-token-scope.ts`). */
function errorKindOf(err: unknown): SignalError {
  if (!(err instanceof ApiClientError)) return "failed";
  switch (err.statusCode) {
    case 400:
    case 401:
    case 403:
    case 404:
      return "link";
    case 410:
      return "expired";
    case 409:
      return "window";
    case 429:
      return "limit";
    default:
      return "failed";
  }
}

/**
 * The manage page's night-of layout: countdown, party and time, directions, the venue's note for
 * tonight and the two guest signals. Signals are information only; the booking never changes. The
 * buttons disable by the same window and caps the server enforces (`guestSignalAvailability`), but
 * the server stays authoritative: its refusal is shown and the counts are re-read from it.
 */
export function NightOfCard({
  token,
  reservation,
  venue,
  initialSignals,
  now,
  formatTime,
}: NightOfCardProps) {
  const { t, i18n } = useTranslation();
  const api = usePublicApiClient({ baseUrl: API_BASE });
  const hintId = useId();
  const lateHintId = `${hintId}-late`;
  const arrivedHintId = `${hintId}-arrived`;
  const [counts, setCounts] = useState<SignalCounts>(initialSignals);
  const [pending, setPending] = useState<GuestSignal["kind"] | null>(null);
  const [sent, setSent] = useState<GuestSignal["kind"] | null>(null);
  const [error, setError] = useState<SignalError | null>(null);

  const availability = guestSignalAvailability({
    status: reservation.status,
    startTime: reservation.startTime,
    timezone: venue.ianaTimezone,
    now,
    priorSignals: counts,
  });

  const send = async (signal: GuestSignal): Promise<void> => {
    setPending(signal.kind);
    setSent(null);
    setError(null);
    try {
      await api.reservations.signalManaged(token, signal);
      setCounts((prev) =>
        signal.kind === "arrived"
          ? { ...prev, arrived: prev.arrived + 1 }
          : { ...prev, late: prev.late + 1 }
      );
      setSent(signal.kind);
    } catch (err) {
      const kind = errorKindOf(err);
      setError(kind);
      if (kind === "window" || kind === "limit") {
        // The cap or window moved under us: take the server's counts instead of guessing. If this
        // read fails too, the refusal above is already visible and the counts stay as they were.
        const fresh = await api.reservations.manageReservation(token).then(
          (data) => data.guestSignals,
          () => undefined
        );
        if (fresh) setCounts(fresh);
      }
    } finally {
      setPending(null);
    }
  };

  const untilStart = Date.parse(reservation.startTime) - now.getTime();
  const duration = formatDurationLabel(untilStart, i18n.language);
  const countdown =
    Math.abs(untilStart) < NOW_WINDOW_MS
      ? t("manageReservation.nightOf.countdownNow")
      : untilStart > 0
        ? t("manageReservation.nightOf.countdownBefore", { duration })
        : t("manageReservation.nightOf.countdownAfter", { duration });

  const busy = pending !== null;
  const outsideWindow = availability.reason === "outside-window";
  const lateCapped = availability.reason === null && !availability.lateAllowed;
  const arrivedDone = availability.reason === null && !availability.arrivedAllowed;
  const venueName = venue.name;

  const statusText =
    pending !== null
      ? t("manageReservation.nightOf.sending")
      : sent === "arrived"
        ? t("manageReservation.nightOf.sentArrived", { venue: venueName })
        : sent === "running-late"
          ? t("manageReservation.nightOf.sentLate", { venue: venueName, minutes: LATE_MINUTES })
          : null;

  return (
    <Card>
      <Stack gap="md" className={styles.inset}>
        <Text as="h2" variant="label">
          {t("manageReservation.nightOf.title", { venue: venueName })}
        </Text>

        <Stack gap="xs">
          <Text variant="body">{countdown}</Text>
          <Text variant="body" color="secondary">
            {t("manageReservation.nightOf.partyAndTime", {
              party: t("bookingWidget.guests", { count: reservation.partySize }),
              time: formatTime(reservation.startTime),
            })}
          </Text>
        </Stack>

        <a
          className={styles.directions}
          href={buildDirectionsUrl(venueName, venue.address)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("manageReservation.nightOf.directionsLabel", { venue: venueName })}
        >
          {t("manageReservation.nightOf.directions")}
        </a>

        {venue.tonightNote && (
          <Stack gap="xs">
            <Text as="h3" variant="label" color="secondary">
              {t("manageReservation.nightOf.noteHeading", { venue: venueName })}
            </Text>
            <Text variant="body" dir="auto" className={styles.note}>
              {venue.tonightNote}
            </Text>
          </Stack>
        )}

        <Stack gap="sm">
          <Text as="h3" variant="label" color="secondary">
            {t("manageReservation.nightOf.signalsHeading", { venue: venueName })}
          </Text>
          <Text variant="caption" color="secondary">
            {t("manageReservation.nightOf.signalsHint")}
          </Text>
          <div className={styles.signals}>
            <Button
              variant="secondary"
              disabled={busy || !availability.lateAllowed}
              isLoading={pending === "running-late"}
              aria-describedby={outsideWindow ? hintId : lateCapped ? lateHintId : undefined}
              onClick={() => void send({ kind: "running-late", minutes: LATE_MINUTES })}
            >
              {t("manageReservation.nightOf.runningLate", { minutes: LATE_MINUTES })}
            </Button>
            <Button
              variant="primary"
              disabled={busy || !availability.arrivedAllowed}
              isLoading={pending === "arrived"}
              aria-describedby={outsideWindow ? hintId : arrivedDone ? arrivedHintId : undefined}
              onClick={() => void send({ kind: "arrived" })}
            >
              {t("manageReservation.nightOf.arrived")}
            </Button>
          </div>

          {outsideWindow && (
            <Text id={hintId} variant="caption" color="secondary">
              {t("manageReservation.nightOf.outsideWindow")}
            </Text>
          )}
          {lateCapped && (
            <Text id={lateHintId} variant="caption" color="secondary">
              {t("manageReservation.nightOf.lateCapped", {
                venue: venueName,
                max: MAX_LATE_SIGNALS,
              })}
            </Text>
          )}
          {arrivedDone && (
            <Text id={arrivedHintId} variant="caption" color="secondary">
              {t("manageReservation.nightOf.arrivedDone", { venue: venueName })}
            </Text>
          )}

          <div role="status" aria-live="polite">
            {statusText !== null && <Text variant="body">{statusText}</Text>}
          </div>
          {error !== null && (
            <Alert variant="error">
              {t(`manageReservation.nightOf.errors.${error}`, { venue: venueName })}
            </Alert>
          )}
        </Stack>
      </Stack>
    </Card>
  );
}
