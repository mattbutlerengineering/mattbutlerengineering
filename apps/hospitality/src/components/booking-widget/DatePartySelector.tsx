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
  const today = new Date().toISOString().split("T")[0];
  const effectiveMinDate = minDate ?? today;

  // Default max date to 30 days from now
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const effectiveMaxDate = maxDate ?? thirtyDaysFromNow.toISOString().split("T")[0];

  const partySizes = PARTY_SIZE_OPTIONS.filter((size) => size <= maxPartySize);

  const canProceed = selectedDate !== null && partySize > 0;

  return (
    <div className={styles.container}>
      <div className={styles.field}>
        <label className={styles.label}>Date</label>
        <input
          type="date"
          value={selectedDate ?? ""}
          onChange={(e) => onDateChange(e.target.value)}
          min={effectiveMinDate}
          max={effectiveMaxDate}
          className={styles.dateInput}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Party Size</label>
        <div className={styles.partyGrid}>
          {partySizes.map((size) => (
            <button
              key={size}
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

      <button onClick={onNext} disabled={!canProceed} className={styles.primaryButton}>
        Find Available Times
      </button>
    </div>
  );
}
