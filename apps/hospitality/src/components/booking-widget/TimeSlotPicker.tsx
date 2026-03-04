import type { TimeSlot } from "@mbe/types";
import styles from "./TimeSlotPicker.module.css";

export interface TimeSlotPickerProps {
  slots: TimeSlot[];
  selectedSlot: TimeSlot | null;
  isLoading: boolean;
  error: string | null;
  onSelectSlot: (slot: TimeSlot) => void;
  onBack: () => void;
  date: string;
  partySize: number;
}

export function TimeSlotPicker({
  slots,
  selectedSlot,
  isLoading,
  error,
  onSelectSlot,
  onBack,
  date,
  partySize,
}: TimeSlotPickerProps) {
  // Format date for display
  const formattedDate = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // Format ISO datetime for display
  const formatTime = (isoTime: string) => {
    const d = new Date(isoTime);
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  // Get hour from ISO datetime for grouping
  const getHour = (isoTime: string) => {
    return new Date(isoTime).getHours();
  };

  // Group slots by meal period
  const groupedSlots = slots.reduce(
    (groups, slot) => {
      const hour = getHour(slot.time);
      let period: "lunch" | "dinner" | "late";
      if (hour < 15) {
        period = "lunch";
      } else if (hour < 20) {
        period = "dinner";
      } else {
        period = "late";
      }
      groups[period].push(slot);
      return groups;
    },
    { lunch: [] as TimeSlot[], dinner: [] as TimeSlot[], late: [] as TimeSlot[] }
  );

  const periodLabels = {
    lunch: "Lunch",
    dinner: "Dinner",
    late: "Late Night",
  };

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <div className={styles.errorMessage}>{error}</div>
        <button onClick={onBack} className={styles.backLink}>
          &larr; Change date or party size
        </button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <button onClick={onBack} className={styles.backLink}>
          &larr; Back
        </button>
        <div className={styles.summaryRight}>
          <div className={styles.summaryDate}>{formattedDate}</div>
          <div className={styles.summaryParty}>
            {partySize} {partySize === 1 ? "guest" : "guests"}
          </div>
        </div>
      </div>

      {slots.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No available times for this date.</p>
          <p className={styles.emptyStateNote}>Try a different date or party size.</p>
        </div>
      ) : (
        <div className={styles.periods}>
          {(["lunch", "dinner", "late"] as const).map((period) => {
            const periodSlots = groupedSlots[period];
            if (periodSlots.length === 0) return null;

            return (
              <div key={period}>
                <h3 className={styles.periodLabel}>{periodLabels[period]}</h3>
                <div className={styles.slotGrid}>
                  {periodSlots.map((slot) => (
                    <button
                      key={slot.time}
                      onClick={() => onSelectSlot(slot)}
                      className={[
                        styles.slot,
                        selectedSlot?.time === slot.time ? styles.slotSelected : "",
                      ].join(" ")}
                    >
                      {formatTime(slot.time)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedSlot && (
        <div className={styles.selectedSummary}>
          <p className={styles.selectedSummaryText}>
            Selected: <strong>{formatTime(selectedSlot.time)}</strong>
            {selectedSlot.tables && selectedSlot.tables.length > 0 && (
              <span className={styles.selectedSummaryNote}>
                {" "}
                - {selectedSlot.tables.length} table{selectedSlot.tables.length > 1 ? "s" : ""}{" "}
                available
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
