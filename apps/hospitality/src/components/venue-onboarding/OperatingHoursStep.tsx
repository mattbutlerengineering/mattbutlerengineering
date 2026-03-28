import { Text } from "@mbe/rialto";
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

interface OperatingHoursStepProps {
  data: OperatingHours;
  onChange: (data: OperatingHours) => void;
}

const DEFAULT_SCHEDULE: DaySchedule = { open: "09:00", close: "22:00" };

export function OperatingHoursStep({ data, onChange }: OperatingHoursStepProps) {
  const isDayEnabled = (day: DayOfWeek): boolean => {
    return data[day] !== undefined;
  };

  const getSchedule = (day: DayOfWeek): DaySchedule => {
    return data[day] ?? DEFAULT_SCHEDULE;
  };

  const handleToggle = (day: DayOfWeek) => {
    if (isDayEnabled(day)) {
      // Remove the day — create new object without the key
      const { [day]: _, ...rest } = data;
      onChange(rest);
    } else {
      onChange({ ...data, [day]: { ...DEFAULT_SCHEDULE } });
    }
  };

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

      <div>
        {DAYS_OF_WEEK.map((day) => {
          const enabled = isDayEnabled(day);
          const schedule = getSchedule(day);

          return (
            <div key={day} className={styles.dayRow}>
              <label className={styles.dayLabel} htmlFor={`toggle-${day}`}>
                {day}
              </label>
              <input
                id={`toggle-${day}`}
                type="checkbox"
                className={styles.checkbox}
                checked={enabled}
                onChange={() => handleToggle(day)}
                aria-label={`${day} open`}
              />
              {enabled ? (
                <div className={styles.dayTimes}>
                  <input
                    type="time"
                    className={styles.timeInput}
                    value={schedule.open}
                    onChange={(e) => handleTimeChange(day, "open", e.target.value)}
                    aria-label={`${day} opening time`}
                  />
                  <Text variant="caption" color="secondary">
                    to
                  </Text>
                  <input
                    type="time"
                    className={styles.timeInput}
                    value={schedule.close}
                    onChange={(e) => handleTimeChange(day, "close", e.target.value)}
                    aria-label={`${day} closing time`}
                  />
                </div>
              ) : (
                <span className={styles.closedText}>Closed</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
