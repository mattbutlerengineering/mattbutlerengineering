import { useTranslation } from "react-i18next";
import { Button, Text } from "@mattbutlerengineering/rialto";
import type { TimeSlot } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { wallTimeInputValue } from "../../utils/venue-wall-time.js";
import styles from "./NewReservationDialog.module.css";

interface OpenTimesStripProps {
  slots: readonly TimeSlot[];
  partySize: number;
  selectedTime: string;
  onPick: (hhmm: string) => void;
  disabled?: boolean;
}

/** One-tap shortcuts for the time field; typing a time stays allowed. */
export function OpenTimesStrip({
  slots,
  partySize,
  selectedTime,
  onPick,
  disabled,
}: OpenTimesStripProps) {
  const { t } = useTranslation();
  const fmt = useVenueFormat();

  if (slots.length === 0) {
    return (
      <Text color="secondary">{t("newReservation.check.openTimesNone", { count: partySize })}</Text>
    );
  }
  return (
    <div role="group" aria-label={t("newReservation.check.openTimes")} className={styles.openTimes}>
      {slots.map((slot) => {
        const value = wallTimeInputValue(slot.time, fmt.timeZone);
        return (
          <Button
            key={slot.time}
            type="button"
            size="sm"
            variant={value === selectedTime ? "primary" : "secondary"}
            aria-pressed={value === selectedTime}
            disabled={disabled}
            onClick={() => onPick(value)}
          >
            {fmt.formatTime(slot.time)}
          </Button>
        );
      })}
    </div>
  );
}
