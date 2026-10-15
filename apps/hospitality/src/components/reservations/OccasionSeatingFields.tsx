import { Select } from "@mattbutlerengineering/rialto";
import type { Occasion, SeatingPreference } from "@mbe/types";

const OCCASION_OPTIONS: { value: Occasion; label: string }[] = [
  { value: "none", label: "None" },
  { value: "birthday", label: "Birthday" },
  { value: "anniversary", label: "Anniversary" },
  { value: "business", label: "Business" },
  { value: "date_night", label: "Date Night" },
  { value: "other", label: "Other" },
];

const SEATING_OPTIONS: { value: SeatingPreference; label: string }[] = [
  { value: "no_preference", label: "No preference" },
  { value: "booth", label: "Booth" },
  { value: "patio", label: "Patio" },
  { value: "bar", label: "Bar" },
  { value: "window", label: "Window" },
  { value: "quiet", label: "Quiet" },
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
  return (
    <>
      <Select
        label="Occasion"
        value={occasion}
        onChange={(v) => onOccasionChange(v as Occasion)}
        disabled={disabled}
        options={OCCASION_OPTIONS}
      />
      <Select
        label="Seating Preference"
        value={seatingPreference}
        onChange={(v) => onSeatingPreferenceChange(v as SeatingPreference)}
        disabled={disabled}
        options={SEATING_OPTIONS}
      />
    </>
  );
}
