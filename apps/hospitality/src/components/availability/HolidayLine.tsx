import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text } from "@mattbutlerengineering/rialto";
import type { HolidayChoice, HolidayLineStatus, NamedHoliday } from "./use-holiday-decision.js";
import styles from "./UpcomingHolidays.module.css";

const CHOICES: readonly HolidayChoice[] = ["closed", "openAsUsual", "specialHours"];

export interface HolidayLineProps {
  readonly holiday: NamedHoliday;
  /** A Manager can decide; a Host reads the decision, or "Not decided". */
  readonly isManager: boolean;
  /** A decided line turned back into the three choices by Change. */
  readonly changing: boolean;
  readonly status: HolidayLineStatus | undefined;
  /** Another holiday is saving: nothing is pressed until it settles. */
  readonly blocked: boolean;
  readonly onChoose: (choice: HolidayChoice) => void;
  readonly onChange: () => void;
  readonly onRetry: () => void;
  /** A rule this flow does not own decides the date: Change opens it in the day drawer. */
  readonly onOpenDay: () => void;
}

/**
 * One holiday (ux.md F1): its name and date, then either the three choices (undecided, or
 * Change pressed) or what was decided with a Change. A failed save stays on the line as
 * "Couldn't save." with Retry, which takes focus; the line is never drawn as decided on failure.
 */
export function HolidayLine(props: HolidayLineProps) {
  const { holiday, isManager, changing, status } = props;
  const { t } = useTranslation();
  const { state, name, dateLabel } = holiday;
  const retryRef = useRef<HTMLButtonElement>(null);
  const failed = status?.phase === "failed";
  const saving = status?.phase === "saving";
  useEffect(() => {
    if (failed) retryRef.current?.focus();
  }, [failed]);

  const showChoices = isManager && (state.kind === "undecided" || changing);
  const current = state.kind === "other" || state.kind === "undecided" ? null : state.kind;
  const decisionText =
    state.kind === "undecided"
      ? t("availabilitySpecial.holidays.notDecided")
      : t(`availabilitySpecial.holidays.decision.${state.kind}`);

  return (
    <li className={styles.holiday}>
      <Text variant="body" className={styles.holidayName}>
        {name}
      </Text>
      <Text variant="caption" color="secondary" className={styles.holidayDate}>
        {dateLabel}
      </Text>
      {showChoices ? (
        <div
          role="group"
          aria-label={t("availabilitySpecial.holidays.group", { name, date: dateLabel })}
          className={styles.choices}
        >
          {CHOICES.map((choice) => (
            <Button
              key={choice}
              variant={current === choice ? "primary" : "secondary"}
              size="sm"
              className={styles.choice}
              disabled={saving || props.blocked}
              isLoading={saving && status.to === choice}
              {...(state.kind === "undecided" ? {} : { "aria-pressed": current === choice })}
              onClick={() => props.onChoose(choice)}
            >
              {t(`availabilitySpecial.holidays.choice.${choice}`)}
            </Button>
          ))}
        </div>
      ) : (
        <div className={styles.decision}>
          <Text variant="body" color={state.kind === "undecided" ? "secondary" : undefined}>
            {decisionText}
          </Text>
          {isManager && state.kind !== "undecided" && (
            <Button
              variant="ghost"
              size="sm"
              className={styles.choice}
              aria-label={t("availabilitySpecial.holidays.changeName", { name, date: dateLabel })}
              onClick={state.kind === "other" ? props.onOpenDay : props.onChange}
            >
              {t("availabilitySpecial.holidays.change")}
            </Button>
          )}
        </div>
      )}
      {failed && (
        <div className={styles.failure} role="alert">
          <Text variant="caption" color="error">
            {t("availabilitySpecial.holidays.saveFailed")}
          </Text>
          <Button
            ref={retryRef}
            variant="ghost"
            size="sm"
            className={styles.choice}
            aria-label={t("availabilitySpecial.holidays.retryName", { name, date: dateLabel })}
            onClick={props.onRetry}
          >
            {t("availabilitySpecial.holidays.retry")}
          </Button>
        </div>
      )}
    </li>
  );
}
