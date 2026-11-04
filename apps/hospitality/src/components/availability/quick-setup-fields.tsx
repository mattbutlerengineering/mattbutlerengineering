import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import { Button, Checkbox, Stack, Text } from "@mattbutlerengineering/rialto";
import {
  WEEKDAY_SHORTCUT,
  WEEKEND_SHORTCUT,
  WEEK_DISPLAY_ORDER,
  issueMessage,
  toggleDayIn,
  type QuickSetupDraft,
  type QuickSetupIssue,
} from "./quick-setup-draft.js";
import { useWeekdayName } from "./quick-setup-field-helpers.js";
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
