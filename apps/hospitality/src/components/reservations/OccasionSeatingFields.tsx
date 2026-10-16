import { useTranslation } from "react-i18next";
import { Select } from "@mattbutlerengineering/rialto";
import type { Occasion, SeatingPreference } from "@mbe/types";

const OCCASIONS: readonly Occasion[] = [
  "none",
  "birthday",
  "anniversary",
  "business",
  "date_night",
  "other",
];

const SEATINGS: readonly SeatingPreference[] = [
  "no_preference",
  "booth",
  "patio",
  "bar",
  "window",
  "quiet",
];

interface OccasionSeatingFieldsProps {
  occasion: Occasion;
  seatingPreference: SeatingPreference;
  onOccasionChange: (value: Occasion) => void;
  onSeatingPreferenceChange: (value: SeatingPreference) => void;
  disabled?: boolean;
}

/** The two Briefing inputs (#6597), shared by every staff create/edit surface. */
export function OccasionSeatingFields({
  occasion,
  seatingPreference,
  onOccasionChange,
  onSeatingPreferenceChange,
  disabled,
}: OccasionSeatingFieldsProps) {
  const { t } = useTranslation();
  return (
    <>
      <Select
        label={t("reservations.occasion.label")}
        value={occasion}
        onChange={(v) => onOccasionChange(v as Occasion)}
        disabled={disabled}
        options={OCCASIONS.map((value) => ({
          value,
          label: t(`reservations.occasion.${value}`),
        }))}
      />
      <Select
        label={t("reservations.seating.label")}
        value={seatingPreference}
        onChange={(v) => onSeatingPreferenceChange(v as SeatingPreference)}
        disabled={disabled}
        options={SEATINGS.map((value) => ({
          value,
          label: t(`reservations.seating.${value}`),
        }))}
      />
    </>
  );
}
