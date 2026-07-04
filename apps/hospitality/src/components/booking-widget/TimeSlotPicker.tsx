import type { TimeSlot } from "@mbe/types";
import {
  Button,
  Alert,
  Skeleton,
  SkeletonGroup,
  EmptyState,
  Heading,
  Text,
} from "@mattbutlerengineering/rialto";
import { formatLongDate, formatTime } from "../../utils/format.js";
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
  /** When provided and slots are empty, shows a "Join Waitlist" option */
  onJoinWaitlist?: () => void;
  /** Estimated wait minutes to display in the no-availability state */
  estimatedWaitMinutes?: number;
  /**
   * Whether the venue has operating hours configured. Defaults to `true`
   * (assume configured) so callers that haven't checked keep the existing
   * "fully booked" messaging when slots are empty.
   */
  hasOperatingHours?: boolean;
  /** Who is viewing this picker — staff get a prompt to configure hours. */
  audience?: "staff" | "guest";
  /** Staff-only: navigates to the operating-hours setup page. */
  onSetHours?: () => void;
}

const SKELETON_SLOT_COUNT = 8;

export function TimeSlotPicker({
  slots,
  selectedSlot,
  isLoading,
  error,
  onSelectSlot,
  onBack,
  date,
  partySize,
  onJoinWaitlist,
  estimatedWaitMinutes,
  hasOperatingHours = true,
  audience = "guest",
  onSetHours,
}: TimeSlotPickerProps) {
  const formattedDate = formatLongDate(date);

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
      return {
        ...groups,
        [period]: [...groups[period], slot],
      };
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
      <SkeletonGroup className={styles.loadingContainer}>
        <div className={styles.slotGrid}>
          {Array.from({ length: SKELETON_SLOT_COUNT }, (_, i) => (
            <Skeleton key={i} variant="rect" width="100%" height={38} />
          ))}
        </div>
      </SkeletonGroup>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <Alert
          variant="error"
          actions={
            <Button variant="ghost" size="sm" onClick={onBack} type="button">
              &larr; Change date or party size
            </Button>
          }
        >
          {error}
        </Alert>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <Button variant="ghost" size="sm" onClick={onBack} type="button">
          &larr; Back
        </Button>
        <div className={styles.summaryRight}>
          <div className={styles.summaryDate}>{formattedDate}</div>
          <div className={styles.summaryParty}>
            {partySize} {partySize === 1 ? "guest" : "guests"}
          </div>
        </div>
      </div>

      {slots.length === 0 ? (
        !hasOperatingHours ? (
          audience === "staff" ? (
            <EmptyState
              heading="No operating hours set"
              description="This venue doesn't have any operating hours configured yet, so guests can't see availability or book a table."
              action={
                <Button variant="primary" onClick={onSetHours} type="button">
                  Set Operating Hours
                </Button>
              }
            />
          ) : (
            <EmptyState
              heading="Online booking isn't available yet"
              description="This venue hasn't set up online reservations yet. Please contact them directly to book a table."
            />
          )
        ) : onJoinWaitlist ? (
          <div className={styles.noAvailabilityContainer}>
            <EmptyState
              heading="No available times"
              description={
                estimatedWaitMinutes != null
                  ? `Estimated wait: ~${estimatedWaitMinutes} min`
                  : "Try a different date or party size."
              }
            />
            <Button variant="primary" onClick={onJoinWaitlist} type="button">
              Join Waitlist
            </Button>
          </div>
        ) : (
          <EmptyState
            heading="No available times"
            description="Try a different date or party size."
          />
        )
      ) : (
        <div className={styles.periods}>
          {(["lunch", "dinner", "late"] as const).map((period) => {
            const periodSlots = groupedSlots[period];
            if (periodSlots.length === 0) return null;

            return (
              <div key={period}>
                <Heading className={styles.periodLabel}>{periodLabels[period]}</Heading>
                <div
                  className={styles.slotGrid}
                  role="listbox"
                  aria-label={`Available ${periodLabels[period].toLowerCase()} times`}
                >
                  {periodSlots.map((slot) => (
                    <Button
                      key={slot.time}
                      role="option"
                      aria-selected={selectedSlot?.time === slot.time}
                      onClick={() => onSelectSlot(slot)}
                      className={[
                        styles.slot,
                        selectedSlot?.time === slot.time ? styles.slotSelected : "",
                      ].join(" ")}
                    >
                      {formatTime(slot.time)}
                    </Button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedSlot && (
        <div className={styles.selectedSummary}>
          <Text className={styles.selectedSummaryText}>
            Selected: <strong>{formatTime(selectedSlot.time)}</strong>
            {selectedSlot.tables && selectedSlot.tables.length > 0 && (
              <Text className={styles.selectedSummaryNote}>
                {" "}
                - {selectedSlot.tables.length} table{selectedSlot.tables.length > 1 ? "s" : ""}{" "}
                available
              </Text>
            )}
          </Text>
        </div>
      )}
    </div>
  );
}
