import { useTranslation } from "react-i18next";
import { Button } from "@mattbutlerengineering/rialto";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { suggestName } from "./suggest-name.js";

export interface NameSuggestionChipProps {
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  /** What is typed in the name field now: a suggestion never replaces it. */
  readonly name: string;
  readonly onUse: (name: string) => void;
}

const DAY = { month: "short", day: "numeric" } as const;

/**
 * One tap fills the name field with a name drawn from the dates (ux.md F-UW: "Summer hours").
 * It is a button beside the field rather than a prefilled value, so an untouched form is still
 * untouched and a name the Manager typed is never overwritten.
 */
export function NameSuggestionChip(props: NameSuggestionChipProps) {
  const { startsOn, endsOn, name, onUse } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const suggestion = suggestName(startsOn, endsOn);
  if (name.trim() !== "" || !suggestion) return null;

  const suggested =
    suggestion.kind === "season"
      ? t(`availabilitySchedules.suggest.${suggestion.season}`)
      : suggestion.kind === "from"
        ? t("availabilitySchedules.suggest.from", {
            from: format.formatCalendarDate(suggestion.from, DAY),
          })
        : t("availabilitySchedules.suggest.range", {
            from: format.formatCalendarDate(suggestion.from, DAY),
            to: format.formatCalendarDate(suggestion.to, DAY),
          });

  return (
    <div>
      <Button variant="secondary" size="sm" onClick={() => onUse(suggested)}>
        {t("availabilitySchedules.suggest.use", { name: suggested })}
      </Button>
    </div>
  );
}
