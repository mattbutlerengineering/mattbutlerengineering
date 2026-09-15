import { Input, Button } from "@mattbutlerengineering/rialto";
import { toDateString } from "@mbe/types";
import styles from "./DatePartySelector.module.css";

export interface DatePartySelectorProps {
  selectedDate: string | null;
  selectedEndDate?: string | null;
  partySize: number;
  onDateChange: (date: string) => void;
  onEndDateChange?: (date: string) => void;
  onPartySizeChange: (size: number) => void;
  onNext: () => void;
  minDate?: string;
  maxDate?: string;
  maxPartySize?: number;
  enableDateRange?: boolean;
  /** Venue contact phone, shown as a tel: link for parties above maxPartySize (#4979). */
  phone?: string;
}

/** Upper bound on how many numbered buttons the grid ever renders (#4979) — a
 * venue's real maxPartySize can be arbitrarily large; beyond this the
 * overflow option is the only way to indicate a bigger party. */
const MAX_RENDERED_PARTY_SIZE_BUTTONS = 20;

export function DatePartySelector({
  selectedDate,
  selectedEndDate,
  partySize,
  onDateChange,
  onEndDateChange,
  onPartySizeChange,
  onNext,
  minDate,
  maxDate,
  maxPartySize = 8,
  enableDateRange = false,
  phone,
}: DatePartySelectorProps) {
  const today = toDateString(new Date());
  const effectiveMinDate = minDate ?? today;

  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const effectiveMaxDate = maxDate ?? toDateString(thirtyDaysFromNow);

  const renderedMaxPartySize = Math.min(maxPartySize, MAX_RENDERED_PARTY_SIZE_BUTTONS);
  const partySizes = Array.from({ length: renderedMaxPartySize }, (_, i) => i + 1);
  const isOverflowSelected = partySize > maxPartySize;

  const canProceed = selectedDate !== null && partySize > 0 && !isOverflowSelected;

  return (
    <div className={styles.container}>
      {enableDateRange ? (
        <>
          <Input
            label="Start Date"
            type="date"
            value={selectedDate ?? ""}
            onChange={(e) => onDateChange(e.target.value)}
            min={effectiveMinDate}
            max={effectiveMaxDate}
          />
          {onEndDateChange && (
            <Input
              label="End Date"
              type="date"
              value={selectedEndDate ?? ""}
              onChange={(e) => onEndDateChange(e.target.value)}
              min={selectedDate ?? effectiveMinDate}
              max={effectiveMaxDate}
            />
          )}
        </>
      ) : (
        <Input
          label="Date"
          type="date"
          value={selectedDate ?? ""}
          onChange={(e) => onDateChange(e.target.value)}
          min={effectiveMinDate}
          max={effectiveMaxDate}
        />
      )}

      <div className={styles.field}>
        <span className={styles.label} id="party-size-label">
          Party Size
        </span>
        <div className={styles.partyGrid} role="group" aria-labelledby="party-size-label">
          {partySizes.map((size) => (
            <Button
              key={size}
              type="button"
              aria-pressed={partySize === size}
              onClick={() => onPartySizeChange(size)}
              className={[
                styles.partyButton,
                partySize === size ? styles.partyButtonActive : "",
              ].join(" ")}
            >
              {size}
            </Button>
          ))}
          <Button
            type="button"
            aria-pressed={isOverflowSelected}
            onClick={() => onPartySizeChange(maxPartySize + 1)}
            className={[
              styles.partyButton,
              isOverflowSelected ? styles.partyButtonActive : "",
            ].join(" ")}
          >
            {maxPartySize}+
          </Button>
        </div>
        {isOverflowSelected && (
          <p className={styles.partySizeNote}>
            {phone ? (
              <>
                For parties larger than {maxPartySize}, call us at{" "}
                <a className={styles.partySizeNoteLink} href={`tel:${phone}`}>
                  {phone}
                </a>
                .
              </>
            ) : (
              `For parties larger than ${maxPartySize}, please contact the venue directly.`
            )}
          </p>
        )}
      </div>

      <Button variant="primary" onClick={onNext} disabled={!canProceed}>
        Find Available Times
      </Button>
    </div>
  );
}
