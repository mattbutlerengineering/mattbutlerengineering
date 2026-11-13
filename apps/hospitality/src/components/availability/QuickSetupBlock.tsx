import { useTranslation } from "react-i18next";
import { Button, Checkbox, Stack, Text } from "@mattbutlerengineering/rialto";
import {
  WEEK_DISPLAY_ORDER,
  type HoursBlock,
  type KeptHours,
  type QuickSetupDraft,
  type ServiceDraft,
} from "./quick-setup-draft.js";
import { keepsOwnSettings } from "./quick-setup-options.js";
import { OwnSettingsCaption } from "./service-fields/ServiceOptions.js";
import { type QuickSetupIssue } from "./quick-setup-validate.js";
import {
  issuesFor,
  useQuickSetupFieldId,
  useQuickSetupRowScope,
  useWeekdayName,
} from "./quick-setup-field-helpers.js";
import { DayShortcuts, IssueText, timeProblems } from "./quick-setup-fields.js";
import { TimesRow } from "./service-fields/TimesRow.js";
import styles from "./QuickSetupForm.module.css";

export interface HoursBlockFieldsetProps {
  readonly draft: QuickSetupDraft;
  readonly service: ServiceDraft;
  readonly block: HoursBlock;
  /** The days the service runs on; a day it does not run on is not offered. */
  readonly offeredDays: readonly number[];
  /** Shown name of the service, for the legend. */
  readonly serviceName: string;
  /** The seating and booking types the service will be saved with (`shownKept`). */
  readonly serviceKept: KeptHours;
  /** The same for this block's days. */
  readonly blockKept: KeptHours;
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
  serviceKept,
  blockKept,
  issues,
  onChange,
  onToggleDay,
  onSetDays,
  onRemove,
}: HoursBlockFieldsetProps) {
  const fieldId = useQuickSetupFieldId();
  const rowScope = useQuickSetupRowScope();
  const { t } = useTranslation();
  const dayName = useWeekdayName();
  const matchesBase =
    block.days.length > 0 &&
    block.opens === service.opens &&
    block.lastSeating === service.lastSeating &&
    block.closes === service.closes;
  // The block has no "Seat every" or "Booked by" of its own: where it will be saved with values
  // unlike the service's, it says which.
  const ownSettingsId = keepsOwnSettings(serviceKept, blockKept)
    ? `${rowScope(service.id, block.id)}-own-settings`
    : undefined;
  return (
    <fieldset
      className={styles.block}
      id={fieldId(service.id, "days", block.id)}
      tabIndex={-1}
      data-hours-block=""
      aria-describedby={ownSettingsId}
    >
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
          times={block}
          onChange={onChange}
          idScope={rowScope(service.id, block.id)}
          problems={timeProblems(draft, issues, service.id, block.id)}
        />
        {matchesBase && (
          <Text variant="caption" color="secondary">
            {t("availability.quickSetup.blockMatchesBase")}
          </Text>
        )}
        {ownSettingsId !== undefined && (
          <OwnSettingsCaption
            id={ownSettingsId}
            seating={blockKept.seating}
            bookingTypes={blockKept.bookingTypes}
          />
        )}
        <div>
          <Button variant="secondary" size="sm" onClick={onRemove}>
            {t("availability.quickSetup.removeBlock")}
          </Button>
        </div>
      </Stack>
    </fieldset>
  );
}
