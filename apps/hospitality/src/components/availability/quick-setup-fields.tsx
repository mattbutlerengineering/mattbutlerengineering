import { use, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { Button, Checkbox, Stack, Text } from "@mattbutlerengineering/rialto";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import {
  FRIDAY_SATURDAY_SHORTCUT,
  WEEKDAY_SHORTCUT,
  WEEKEND_SHORTCUT,
  WEEK_DISPLAY_ORDER,
  minutesOf,
  toClock,
  toggleDayIn,
  type QuickSetupDraft,
} from "./quick-setup-draft.js";
import { firstClearStart, overlapDayFix } from "./quick-setup-placement.js";
import { issueMessage, serviceLabel, type QuickSetupIssue } from "./quick-setup-validate.js";
import { QuickSetupFixContext, issuesFor, useWeekdayName } from "./quick-setup-field-helpers.js";
import type { TimeField } from "./service-fields/service-times.js";
import type { TimeProblems } from "./service-fields/TimesRow.js";
import styles from "./QuickSetupForm.module.css";

export function IssueText({
  problems,
  draft,
}: {
  readonly problems: readonly QuickSetupIssue[];
  readonly draft: QuickSetupDraft;
}) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const dayName = useWeekdayName();
  const applyFix = use(QuickSetupFixContext);
  // One action per service: the same later start clears the overlap on every day it names.
  const movable = [
    ...new Set(
      problems.flatMap((p) =>
        p.code === "overlap" && p.blockId === undefined && !p.mirrored ? [p.serviceId] : []
      )
    ),
  ];
  const fixes = applyFix
    ? movable.flatMap((serviceId) => {
        const service = draft.services.find((s) => s.id === serviceId);
        const opensAt = serviceId === null ? null : firstClearStart(draft, serviceId);
        const current = service ? minutesOf(service)?.opensAt : undefined;
        return serviceId !== null && opensAt !== null && opensAt !== current
          ? [{ serviceId, opensAt }]
          : [];
      })
    : [];
  // A day fix changes only the row it is offered on, so it is safe for a mirrored overlap too.
  const dayFixable = [
    ...new Set(
      problems.flatMap((p) =>
        p.code === "overlap" && p.blockId === undefined ? [p.serviceId] : []
      )
    ),
  ];
  const dayFixes = applyFix
    ? dayFixable.flatMap((serviceId) => {
        if (serviceId === null) return [];
        const fix = overlapDayFix(draft, serviceId);
        return fix ? [{ serviceId, ...fix }] : [];
      })
    : [];
  return (
    <>
      {problems.map((p) => (
        <Text
          key={`${p.code}-${p.blockId ?? ""}-${p.weekday ?? ""}`}
          variant="caption"
          color="error"
          role="alert"
        >
          {issueMessage(p, draft, t, (day) => dayName(day))}
        </Text>
      ))}
      {applyFix &&
        fixes.map((fix) => (
          <div key={fix.serviceId}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => applyFix({ kind: "time", ...fix })}
            >
              {t("availability.quickSetup.moveTo", {
                service: serviceLabel(draft, fix.serviceId, t),
                time: format.formatLocalTime(toClock(fix.opensAt)),
              })}
            </Button>
          </div>
        ))}
      {applyFix &&
        dayFixes.map((fix) => (
          <div key={`days-${fix.serviceId}`}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => applyFix({ kind: "days", serviceId: fix.serviceId, days: fix.days })}
            >
              {t(`availability.quickSetup.restrictDays.${fix.shortcut}`, {
                service: serviceLabel(draft, fix.serviceId, t),
              })}
            </Button>
          </div>
        ))}
    </>
  );
}

export interface DayPickerProps {
  readonly legend: string;
  readonly days: readonly number[];
  readonly onChange: (days: readonly number[]) => void;
  /** With `problems`: where the problems with these days are said. Without them, none are. */
  readonly draft?: QuickSetupDraft;
  readonly problems?: readonly QuickSetupIssue[];
  /**
   * Days shown ticked and unchangeable (Copy's own weekday). `onChange` never includes them, so
   * the caller keeps only the days it can still choose.
   */
  readonly lockedDays?: readonly number[];
  /** The fieldset's DOM id, so the card can move focus to it. */
  readonly id: string;
  readonly ref?: Ref<HTMLFieldSetElement>;
}

const SHORTCUTS = [
  { id: "weekdays", days: WEEKDAY_SHORTCUT },
  { id: "weekends", days: WEEKEND_SHORTCUT },
  { id: "fridaySaturday", days: FRIDAY_SATURDAY_SHORTCUT },
  { id: "everyDay", days: WEEK_DISPLAY_ORDER },
] as const;

/** The day shortcuts: Weekdays, Weekends, Fri–Sat and Every day. */
export function DayShortcuts({
  onChange,
}: {
  readonly onChange: (days: readonly number[]) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.chips}>
      {SHORTCUTS.map((shortcut) => (
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
  );
}

/** A group of day shortcuts and the seven weekdays: the shared Days and a service's own days. */
export function DayPicker({
  legend,
  days,
  onChange,
  draft,
  problems,
  lockedDays = [],
  id,
  ref,
}: DayPickerProps) {
  const dayName = useWeekdayName();
  const choose = (next: readonly number[]) =>
    onChange(next.filter((day) => !lockedDays.includes(day)));
  return (
    <fieldset className={styles.days} id={id} ref={ref} tabIndex={-1}>
      <legend className={styles.legend}>{legend}</legend>
      <Stack gap="sm">
        <DayShortcuts onChange={choose} />
        <div className={styles.dayToggles}>
          {WEEK_DISPLAY_ORDER.map((day) => {
            const locked = lockedDays.includes(day);
            return (
              <Checkbox
                key={day}
                label={dayName(day)}
                checked={locked || days.includes(day)}
                disabled={locked}
                onCheckedChange={() => choose(toggleDayIn(days, day))}
              />
            );
          })}
        </div>
        {draft && problems && <IssueText problems={problems} draft={draft} />}
      </Stack>
    </fieldset>
  );
}

/**
 * The problems with a service's three times (or a different-hours block's), worded for the shared
 * times row: per field, with the fixes this form offers.
 */
export function timeProblems(
  draft: QuickSetupDraft,
  issues: readonly QuickSetupIssue[],
  serviceId: string,
  blockId?: string
): TimeProblems {
  const said = (field: TimeField) => (
    <IssueText problems={issuesFor(issues, serviceId, field, blockId)} draft={draft} />
  );
  return { opens: said("opens"), lastSeating: said("lastSeating"), closes: said("closes") };
}
