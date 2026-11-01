import { useTranslation } from "react-i18next";
import type { StrandedReservation } from "@mbe/types";
import { useOptionalVenue } from "../../contexts/venue-context-object.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { venueDate } from "../../utils/service-day.js";
import styles from "./StrandedBookings.module.css";

/**
 * Each booking a change would leave without service (ux.md S4, S7): who, when, and a link to it.
 * The link opens a new tab, so going to look at a booking does not throw away the draft.
 */
export function StrandedBookings(props: { readonly reservations: readonly StrandedReservation[] }) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const timezone = useOptionalVenue()?.selectedVenue?.ianaTimezone;
  if (props.reservations.length === 0) return null;

  const line = (r: StrandedReservation) =>
    t("availability.preview.strandedItem", {
      name: r.guestName ?? t("availability.close.step2.guestUnnamed"),
      date: format.formatInstant(r.startTime, { weekday: "short", month: "short", day: "numeric" }),
      time: format.formatTime(r.startTime),
      size: r.partySize,
      reason: t(`availability.preview.reason.${r.reason}`),
    });
  // The server names the service day; an answer from before it did falls back to the start time's.
  const href = (r: StrandedReservation) => {
    const day = r.serviceDate ?? (timezone ? venueDate(new Date(r.startTime), timezone) : null);
    const query = day ? `date=${day}&selected=${r.id}` : `selected=${r.id}`;
    return `${import.meta.env.BASE_URL}timeline?${query}`;
  };

  return (
    <ul className={styles.list}>
      {props.reservations.map((r) => (
        <li key={r.id}>
          <a
            className={styles.link}
            href={href(r)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("availability.preview.strandedOpens", { line: line(r) })}
          >
            {line(r)}
          </a>
        </li>
      ))}
    </ul>
  );
}
