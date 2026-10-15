import { useState, useCallback, useRef } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Text, Checkbox, ConfirmDialog } from "@mattbutlerengineering/rialto";
import type { OperatingHours, DaySchedule } from "@mbe/types";
import { localeRuntime } from "../../i18n/runtime.js";
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
  const { t } = useTranslation();
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
        {t("onboarding.hours.instructions")}
      </Text>

      {errors?.global && (
        <Text className={styles.errorText} role="alert">
          {errors.global}
        </Text>
      )}

      <div>
        {DAYS_OF_WEEK.map((day) => {
          const enabled = isDayEnabled(day);
          const schedule = getSchedule(day);
          const dayError = errors?.days?.[day];
          const hasTimeError = enabled && isCloseBeforeOpen(schedule.open, schedule.close);
          const dayName = t(`onboarding.days.${day}`);

          return (
            <div key={day} className={styles.dayRow}>
              <Checkbox
                label={dayName}
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
                      aria-label={t("onboarding.hours.openingTime", { day: dayName })}
                    />
                    <Text variant="caption" color="secondary">
                      {t("onboarding.hours.to")}
                    </Text>
                    <input
                      type="time"
                      className={`${styles.timeInput} ${hasTimeError ? styles.timeInputError : ""}`}
                      value={schedule.close}
                      onChange={(e) => handleTimeChange(day, "close", e.target.value)}
                      aria-label={t("onboarding.hours.closingTime", { day: dayName })}
                    />
                  </div>
                  {hasTimeError && (
                    <Text className={styles.errorText} role="alert">
                      {t("onboarding.hours.closeAfterOpen")}
                    </Text>
                  )}
                  {dayError && !hasTimeError && (
                    <Text className={styles.errorText} role="alert">
                      {dayError}
                    </Text>
                  )}
                </div>
              ) : (
                <Text className={styles.closedText}>{t("onboarding.hours.closed")}</Text>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={confirmDay !== null}
        title={t("onboarding.hours.closeDayTitle", {
          day: confirmDay ? t(`onboarding.days.${confirmDay}`) : "",
        })}
        description={t("onboarding.hours.closeDayDescription")}
        confirmLabel={t("onboarding.hours.closeDayConfirm")}
        cancelLabel={t("onboarding.hours.closeDayCancel")}
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
  data: OperatingHours,
  t: TFunction = localeRuntime.i18n.t
): OperatingHoursValidationErrors | null {
  const dayErrors: Partial<Record<DayOfWeek, string>> = {};
  let hasError = false;

  for (const day of DAYS_OF_WEEK) {
    const schedule = data[day];
    if (schedule && isCloseBeforeOpen(schedule.open, schedule.close)) {
      dayErrors[day] = t("onboarding.hours.closeAfterOpen");
      hasError = true;
    }
  }

  const enabledDays = DAYS_OF_WEEK.filter((d) => data[d] !== undefined);

  if (enabledDays.length === 0) {
    return {
      global: t("onboarding.hours.atLeastOne"),
      ...(hasError ? { days: dayErrors } : {}),
    };
  }

  return hasError ? { days: dayErrors } : null;
}
