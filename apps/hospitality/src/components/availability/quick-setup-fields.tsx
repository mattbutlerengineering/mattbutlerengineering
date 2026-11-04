import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import { Button, Checkbox, Stack, Text, TimePicker } from "@mattbutlerengineering/rialto";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { clockHour } from "../../utils/clock-hour.js";
import {
  WEEKDAY_SHORTCUT,
  WEEKEND_SHORTCUT,
  WEEK_DISPLAY_ORDER,
  issueMessage,
  setServiceTime,
  toggleDayIn,
  type DraftTimes,
  type QuickSetupDraft,
  type QuickSetupIssue,
} from "./quick-setup-draft.js";
import { issuesFor, quickSetupFieldId, useWeekdayName } from "./quick-setup-field-helpers.js";
import styles from "./QuickSetupForm.module.css";

export function IssueText({
  problems,
  draft,
}: {
  readonly problems: readonly QuickSetupIssue[];
  readonly draft: QuickSetupDraft;
}) {
  const { t } = useTranslation();
  const dayName = useWeekdayName();
  return problems.map((p) => (
    <Text
      key={`${p.code}-${p.blockId ?? ""}-${p.weekday ?? ""}`}
      variant="caption"
      color="error"
      role="alert"
    >
      {issueMessage(p, draft, t, (day) => dayName(day))}
    </Text>
  ));
}

export interface DayPickerProps {
  readonly legend: string;
  readonly days: readonly number[];
  readonly onChange: (days: readonly number[]) => void;
  readonly draft: QuickSetupDraft;
  readonly problems: readonly QuickSetupIssue[];
  /** The fieldset's DOM id, so the card can move focus to it. */
  readonly id: string;
  readonly ref?: Ref<HTMLFieldSetElement>;
}

/** A group of day shortcuts and the seven weekdays: the shared Days and a service's own days. */
export function DayPicker({ legend, days, onChange, draft, problems, id, ref }: DayPickerProps) {
  const { t } = useTranslation();
  const dayName = useWeekdayName();
  const shortcuts = [
    { id: "weekdays", days: WEEKDAY_SHORTCUT },
    { id: "weekends", days: WEEKEND_SHORTCUT },
    { id: "everyDay", days: WEEK_DISPLAY_ORDER },
  ] as const;
  return (
    <fieldset className={styles.days} id={id} ref={ref} tabIndex={-1}>
      <legend className={styles.legend}>{legend}</legend>
      <Stack gap="sm">
        <div className={styles.chips}>
          {shortcuts.map((shortcut) => (
            <Button
              key={shortcut.id}
              variant="secondary"
              size="sm"
              onClick={() => onChange(shortcut.days)}
            >
              {t(`availability.quickSetup.shortcuts.${shortcut.id}`)}
            </Button>
          ))}
        </div>
        <div className={styles.dayToggles}>
          {WEEK_DISPLAY_ORDER.map((day) => (
            <Checkbox
              key={day}
              label={dayName(day)}
              checked={days.includes(day)}
              onCheckedChange={() => onChange(toggleDayIn(days, day))}
            />
          ))}
        </div>
        <IssueText problems={problems} draft={draft} />
      </Stack>
    </fieldset>
  );
}

const TIME_FIELDS = ["opens", "lastSeating", "closes"] as const;

export interface TimesRowProps<T extends DraftTimes> {
  readonly draft: QuickSetupDraft;
  readonly serviceId: string;
  /** Set for a different-hours block's times. */
  readonly blockId?: string;
  readonly times: T;
  readonly issues: readonly QuickSetupIssue[];
  readonly onChange: (next: T) => void;
}

/** Opens, last seating and closes: a service's own, or a different-hours block's. */
export function TimesRow<T extends DraftTimes>({
  draft,
  serviceId,
  blockId,
  times,
  issues,
  onChange,
}: TimesRowProps<T>) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const { opens, closes } = times;
  return (
    <>
      <div className={styles.times}>
        {TIME_FIELDS.map((field) => (
          <div key={field} className={styles.timeField}>
            <TimePicker
              id={quickSetupFieldId(serviceId, field, blockId)}
              label={t(`availability.quickSetup.${field}`)}
              value={times[field]}
              onChange={(value) => onChange(setServiceTime(times, field, value))}
            />
            <IssueText problems={issuesFor(issues, serviceId, field, blockId)} draft={draft} />
          </div>
        ))}
      </div>
      {opens !== null && closes !== null && closes < opens && (
        <Text variant="caption" color="secondary">
          {t("availability.editor.overnightNextDay", {
            time: format.formatLocalTime(closes),
            count: clockHour(Number.parseInt(closes, 10) * 60),
          })}
        </Text>
      )}
    </>
  );
}
