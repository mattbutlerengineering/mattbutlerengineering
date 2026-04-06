import { Input, Button } from "@mbe/rialto";
import { toDateString } from "@mbe/types";
import styles from "./DatePartySelector.module.css";

export interface DatePartySelectorProps {
  selectedDate: string | null;
  partySize: number;
  onDateChange: (date: string) => void;
  onPartySizeChange: (size: number) => void;
  onNext: () => void;
  minDate?: string;
  maxDate?: string;
  maxPartySize?: number;
}

const PARTY_SIZE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

export function DatePartySelector({
  selectedDate,
  partySize,
  onDateChange,
  onPartySizeChange,
  onNext,
  minDate,
  maxDate,
  maxPartySize = 8,
}: DatePartySelectorProps) {
  // Default min date to today
  const today = toDateString(new Date());
  const effectiveMinDate = minDate ?? today;

  // Default max date to 30 days from now
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const effectiveMaxDate = maxDate ?? toDateString(thirtyDaysFromNow);

  const partySizes = PARTY_SIZE_OPTIONS.filter((size) => size <= maxPartySize);

  const canProceed = selectedDate !== null && partySize > 0;

  return (
    <div className={styles.container}>
      <Input
        label="Date"
        type="date"
        value={selectedDate ?? ""}
        onChange={(e) => onDateChange(e.target.value)}
        min={effectiveMinDate}
        max={effectiveMaxDate}
      />

      <div className={styles.field}>
        <span className={styles.label}>Party Size</span>
        <div className={styles.partyGrid}>
          {partySizes.map((size) => (
            <button
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
            </button>
          ))}
        </div>
        {partySize > maxPartySize && (
          <p className={styles.partySizeNote}>
            For parties larger than {maxPartySize}, please call us.
          </p>
        )}
      </div>

      <Button variant="primary" onClick={onNext} disabled={!canProceed}>
        Find Available Times
      </Button>
    </div>
  );
}
