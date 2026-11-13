import { useTranslation } from "react-i18next";
import { Select, Text } from "@mattbutlerengineering/rialto";
import type { Seating } from "@mbe/types";
import { useVenueFormat } from "../../../hooks/useVenueFormat.js";
import { BOOKED_BY, SEATING_INTERVALS, bookedById, type BookingTypes } from "./service-options.js";
import { toClock } from "./service-times.js";
import { serviceFieldId } from "./TimesRow.js";
import styles from "./ServiceFields.module.css";

/** Fixed seating times as the venue reads them: "6:00 PM and 8:00 PM". */
function useFixedTimesText() {
  const format = useVenueFormat();
  return (fixed: readonly number[]) =>
    new Intl.ListFormat(format.locale, { type: "conjunction" }).format(
      fixed.map((minute) => format.formatLocalTime(toClock(minute)))
    );
}

export interface ServiceOptionsProps {
  readonly seating: Seating;
  readonly bookingTypes: BookingTypes;
  readonly onSeatingChange: (seating: Seating) => void;
  readonly onBookingTypesChange: (bookingTypes: BookingTypes) => void;
  readonly idScope: string;
}

/**
 * "Seat every" and "Booked by". A service with fixed seating times shows them as text: there is
 * no control for them, so they cannot be changed here.
 */
export function ServiceOptions({
  seating,
  bookingTypes,
  onSeatingChange,
  onBookingTypesChange,
  idScope,
}: ServiceOptionsProps) {
  const { t } = useTranslation();
  const fixedTimes = useFixedTimesText();
  const interval = "interval" in seating ? seating.interval : null;
  // A stored interval that is not one of the offered ones is still shown, so it is not lost.
  const intervals =
    interval !== null && !SEATING_INTERVALS.some((n) => n === interval)
      ? [...SEATING_INTERVALS, interval].sort((a, b) => a - b)
      : SEATING_INTERVALS;
  return (
    <div className={styles.options}>
      {"fixed" in seating ? (
        <Text variant="caption" color="secondary">
          {t("availability.editor.fixedTimes", { times: fixedTimes(seating.fixed) })}
        </Text>
      ) : (
        <Select
          id={serviceFieldId(idScope, "seating")}
          label={t("availabilityHub.serviceFields.seatEvery")}
          value={String(interval)}
          options={intervals.map((n) => ({
            value: String(n),
            label: t("availabilityHub.serviceFields.minutes", { minutes: n }),
          }))}
          onChange={(value) => onSeatingChange({ version: 1, interval: Number(value) })}
        />
      )}
      <Select
        id={serviceFieldId(idScope, "bookedBy")}
        label={t("availabilityHub.serviceFields.bookedBy")}
        value={bookedById(bookingTypes)}
        options={BOOKED_BY.map((option) => ({
          value: option.id,
          label: t(`availability.editor.bookingOptions.${option.id}`),
        }))}
        onChange={(value) =>
          onBookingTypesChange([...(BOOKED_BY.find((option) => option.id === value)?.types ?? [])])
        }
      />
    </div>
  );
}

export interface OwnSettingsCaptionProps {
  /** The DOM id, so the group these hours sit in can be described by the caption. */
  readonly id: string;
  readonly seating: Seating;
  readonly bookingTypes: BookingTypes;
}

/**
 * Says, for hours that have no "Seat every" and "Booked by" controls of their own, which values
 * they keep. The form shows it only where those differ from the service's.
 */
export function OwnSettingsCaption({ id, seating, bookingTypes }: OwnSettingsCaptionProps) {
  const { t } = useTranslation();
  const fixedTimes = useFixedTimesText();
  return (
    <Text id={id} variant="caption" color="secondary">
      {t("availabilityHub.serviceFields.ownSettings", {
        seating:
          "interval" in seating
            ? t("availabilityHub.serviceFields.ownSeatEvery", { minutes: seating.interval })
            : t("availabilityHub.serviceFields.ownFixedTimes", {
                times: fixedTimes(seating.fixed),
              }),
        booking: t(`availabilityHub.serviceFields.ownBookedBy.${bookedById(bookingTypes)}`),
      })}
    </Text>
  );
}
