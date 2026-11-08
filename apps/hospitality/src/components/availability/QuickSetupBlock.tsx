import { useTranslation } from "react-i18next";
import { Button, Checkbox, Stack, Text } from "@mattbutlerengineering/rialto";
import {
  WEEK_DISPLAY_ORDER,
  type HoursBlock,
  type QuickSetupDraft,
  type QuickSetupIssue,
  type ServiceDraft,
} from "./quick-setup-draft.js";
import { issuesFor, useQuickSetupFieldId, useWeekdayName } from "./quick-setup-field-helpers.js";
import { DayShortcuts, IssueText, TimesRow } from "./quick-setup-fields.js";
import styles from "./QuickSetupForm.module.css";

export interface HoursBlockFieldsetProps {
  readonly draft: QuickSetupDraft;
  readonly service: ServiceDraft;
  readonly block: HoursBlock;
  /** The days the service runs on; a day it does not run on is not offered. */
  readonly offeredDays: readonly number[];
  /** Shown name of the service, for the legend. */
  readonly serviceName: string;
  readonly issues: readonly QuickSetupIssue[];
  readonly onChange: (next: HoursBlock) => void;
  readonly onToggleDay: (day: number) => void;
  /** A shortcut's days, limited to those the service runs. */
  readonly onSetDays: (days: readonly number[]) => void;
  readonly onRemove: () => void;
}

/** S13: other hours for some of a service's days. Exists in the DOM only while the block does. */
export function HoursBlockFieldset({
  draft,
  service,
  block,
  offeredDays,
  serviceName,
  issues,
  onChange,
  onToggleDay,
  onSetDays,
  onRemove,
}: HoursBlockFieldsetProps) {
  const fieldId = useQuickSetupFieldId();
  const { t } = useTranslation();
  const dayName = useWeekdayName();
  const matchesBase =
    block.opens === service.opens &&
    block.lastSeating === service.lastSeating &&
    block.closes === service.closes;
  return (
    <fieldset className={styles.block} id={fieldId(service.id, "days", block.id)} tabIndex={-1}>
      <legend className={styles.legend}>
        {t("availability.quickSetup.blockLegend", { service: serviceName })}
      </legend>
      <Stack gap="sm">
        <DayShortcuts onChange={onSetDays} />
        <div className={styles.dayToggles}>
          {WEEK_DISPLAY_ORDER.filter((day) => offeredDays.includes(day)).map((day) => (
            <Checkbox
              key={day}
              label={dayName(day, "short")}
              checked={block.days.includes(day)}
              onCheckedChange={() => onToggleDay(day)}
            />
          ))}
        </div>
        <IssueText problems={issuesFor(issues, service.id, "days", block.id)} draft={draft} />
        <TimesRow
          draft={draft}
          serviceId={service.id}
          blockId={block.id}
          times={block}
          issues={issues}
          onChange={onChange}
        />
        {matchesBase && (
          <Text variant="caption" color="secondary">
            {t("availability.quickSetup.blockMatchesBase")}
          </Text>
        )}
        <div>
          <Button variant="ghost" size="sm" onClick={onRemove}>
            {t("availability.quickSetup.removeBlock")}
          </Button>
        </div>
      </Stack>
    </fieldset>
  );
}
