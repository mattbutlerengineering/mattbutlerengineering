import { useState, useCallback, useRef } from "react";
import { Text, Checkbox, ConfirmDialog } from "@mattbutlerengineering/rialto";
import type { OperatingHours, DaySchedule } from "@mbe/types";
import styles from "./venue-onboarding.module.css";

const DAYS_OF_WEEK = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export interface OperatingHoursValidationErrors {
  readonly global?: string;
  readonly days?: Readonly<Partial<Record<DayOfWeek, string>>>;
}

interface OperatingHoursStepProps {
  data: OperatingHours;
  errors?: OperatingHoursValidationErrors;
  onChange: (data: OperatingHours) => void;
}

const DEFAULT_SCHEDULE: DaySchedule = { open: "09:00", close: "22:00" };

/** Returns true when close is at or before open (invalid, unless overnight). */
function isCloseBeforeOpen(open: string, close: string): boolean {
  return close !== "" && open !== "" && close <= open;
}

export function OperatingHoursStep({ data, errors, onChange }: OperatingHoursStepProps) {
  const [confirmDay, setConfirmDay] = useState<DayOfWeek | null>(null);

  // Keep a cache of previously-set schedules so re-enabling restores times
  const cachedSchedulesRef = useRef<Partial<Record<DayOfWeek, DaySchedule>>>({});

  const isDayEnabled = (day: DayOfWeek): boolean => {
    return data[day] !== undefined;
  };

  const getSchedule = (day: DayOfWeek): DaySchedule => {
    return data[day] ?? DEFAULT_SCHEDULE;
  };

  const disableDay = useCallback(
    (day: DayOfWeek) => {
      // Cache the current schedule before removing
      const currentSchedule = data[day];
      if (currentSchedule) {
        cachedSchedulesRef.current = {
          ...cachedSchedulesRef.current,
          [day]: { ...currentSchedule },
        };
      }
      const { [day]: _, ...rest } = data;
      onChange(rest);
    },
    [data, onChange]
  );

  const handleToggle = useCallback(
    (day: DayOfWeek) => {
      if (data[day] !== undefined) {
        // If the day has non-default times, confirm before clearing
        const schedule = data[day];
        const hasCustomTimes =
          schedule &&
          (schedule.open !== DEFAULT_SCHEDULE.open || schedule.close !== DEFAULT_SCHEDULE.close);

        if (hasCustomTimes) {
          setConfirmDay(day);
        } else {
          disableDay(day);
        }
      } else {
        // Re-enable with cached schedule or default
        const restored = cachedSchedulesRef.current[day] ?? { ...DEFAULT_SCHEDULE };
        onChange({ ...data, [day]: { ...restored } });
      }
    },
    [data, onChange, disableDay]
  );

  const handleTimeChange = (day: DayOfWeek, field: "open" | "close", value: string) => {
    const currentSchedule = getSchedule(day);
    onChange({
      ...data,
      [day]: { ...currentSchedule, [field]: value },
    });
  };

  return (
    <div className={styles.stepContainer}>
      <Text variant="caption" color="secondary">
        Toggle each day to set opening and closing times. Days left off will be marked as closed.
      </Text>

      {errors?.global && (
        <span className={styles.errorText} role="alert">
          {errors.global}
        </span>
      )}

      <div>
        {DAYS_OF_WEEK.map((day) => {
          const enabled = isDayEnabled(day);
          const schedule = getSchedule(day);
          const dayError = errors?.days?.[day];
          const hasTimeError = enabled && isCloseBeforeOpen(schedule.open, schedule.close);

          return (
            <div key={day} className={styles.dayRow}>
              <Checkbox
                label={day}
                checked={enabled}
                onCheckedChange={() => handleToggle(day)}
                className={styles.dayCheckbox}
              />
              {enabled ? (
                <div className={styles.dayTimesColumn}>
                  <div className={styles.dayTimes}>
                    <input
                      type="time"
                      className={`${styles.timeInput} ${hasTimeError ? styles.timeInputError : ""}`}
                      value={schedule.open}
                      onChange={(e) => handleTimeChange(day, "open", e.target.value)}
                      aria-label={`${day} opening time`}
                    />
                    <Text variant="caption" color="secondary">
                      to
                    </Text>
                    <input
                      type="time"
                      className={`${styles.timeInput} ${hasTimeError ? styles.timeInputError : ""}`}
                      value={schedule.close}
                      onChange={(e) => handleTimeChange(day, "close", e.target.value)}
                      aria-label={`${day} closing time`}
                    />
                  </div>
                  {hasTimeError && (
                    <span className={styles.errorText} role="alert">
                      Closing time must be after opening time
                    </span>
                  )}
                  {dayError && !hasTimeError && (
                    <span className={styles.errorText} role="alert">
                      {dayError}
                    </span>
                  )}
                </div>
              ) : (
                <span className={styles.closedText}>Closed</span>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={confirmDay !== null}
        title={`Close ${confirmDay ?? ""}?`}
        description="This will clear the custom opening and closing times you set for this day."
        confirmLabel="Close Day"
        cancelLabel="Keep Open"
        variant="destructive"
        onConfirm={() => {
          if (confirmDay) {
            disableDay(confirmDay);
          }
          setConfirmDay(null);
        }}
        onCancel={() => setConfirmDay(null)}
      />
    </div>
  );
}

/** Validate operating hours data. Returns errors or null if valid. */
export function validateOperatingHours(
  data: OperatingHours
): OperatingHoursValidationErrors | null {
  const dayErrors: Partial<Record<DayOfWeek, string>> = {};
  let hasError = false;

  for (const day of DAYS_OF_WEEK) {
    const schedule = data[day];
    if (schedule && isCloseBeforeOpen(schedule.open, schedule.close)) {
      dayErrors[day] = "Closing time must be after opening time";
      hasError = true;
    }
  }

  const enabledDays = DAYS_OF_WEEK.filter((d) => data[d] !== undefined);

  if (enabledDays.length === 0) {
    return {
      global: "At least one day must be open",
      ...(hasError ? { days: dayErrors } : {}),
    };
  }

  return hasError ? { days: dayErrors } : null;
}
